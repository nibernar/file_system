import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';
import { FILE_SYSTEM_CONSTANTS } from '../../constants/file-system.constants';

/**
 * Interface pour les informations d'intelligence IP
 */
export interface IpIntelligence {
  ip: string;
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isVpn: boolean;
  isTor: boolean;
  isProxy: boolean;
  isHosting: boolean;
  threatLevel: 'low' | 'medium' | 'high';
  isp?: string;
  organization?: string;
  asn?: string;
  timezone?: string;
}

interface GeoApiResponse {
  status: string;
  message?: string;
  continent?: string;
  continentCode?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  district?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  offset?: number;
  currency?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  reverse?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  query?: string;
}
/**
 * Service d'intelligence IP pour la géolocalisation et la détection de menaces
 *
 * Ce service utilise plusieurs sources de données pour déterminer :
 * - La localisation géographique d'une IP
 * - Si l'IP provient d'un VPN, Tor ou proxy
 * - Le niveau de menace associé à l'IP
 *
 * @class IpIntelligenceService
 */
@Injectable()
export class IpIntelligenceService {
  private readonly logger = new Logger(IpIntelligenceService.name);

  /**
   * Durée de cache pour les résultats d'intelligence IP (24 heures)
   */
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  /**
   * Préfixe pour les clés de cache
   */
  private readonly CACHE_PREFIX = 'ip_intelligence:';

  /**
   * Liste des plages IP Tor connues (à mettre à jour régulièrement)
   */
  private readonly TOR_EXIT_NODES: Set<string> = new Set();

  /**
   * Liste des ASN connus pour les services VPN/Proxy
   */
  private readonly VPN_ASN_LIST = [
    'AS13335', // Cloudflare
    'AS16276', // OVH
    'AS24940', // Hetzner
    'AS14061', // DigitalOcean
    'AS16509', // Amazon AWS
    'AS15169', // Google
  ];

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly httpService: HttpService,
  ) {
    // Initialisation de la liste des noeuds Tor au démarrage
    this.updateTorExitNodes().catch((err) =>
      this.logger.error('Failed to update Tor exit nodes:', err),
    );
  }

  /**
   * Obtient les informations d'intelligence pour une adresse IP
   *
   * @param ip - Adresse IP à analyser
   * @returns Informations d'intelligence IP
   */
  async getIpIntelligence(ip: string): Promise<IpIntelligence> {
    try {
      // Vérification du cache
      const cacheKey = `${this.CACHE_PREFIX}${ip}`;
      const cached = await this.cacheManager.get<IpIntelligence>(cacheKey);
      if (cached) {
        this.logger.debug(`IP intelligence cache hit for ${ip}`);
        return cached;
      }

      // IPs locales/privées
      if (this.isPrivateIp(ip)) {
        const localResult: IpIntelligence = {
          ip,
          country: 'Local',
          countryCode: 'XX',
          region: 'Local Network',
          city: 'Localhost',
          isVpn: false,
          isTor: false,
          isProxy: false,
          isHosting: false,
          threatLevel: 'low',
          isp: 'Local Network',
        };
        return localResult;
      }

      // Analyse de l'IP
      const intelligence = await this.analyzeIp(ip);

      // Mise en cache du résultat
      await this.cacheManager.set(cacheKey, intelligence, this.CACHE_TTL);

      this.logger.log(
        `IP intelligence generated for ${ip}: ${JSON.stringify({
          country: intelligence.country,
          isVpn: intelligence.isVpn,
          isTor: intelligence.isTor,
          threatLevel: intelligence.threatLevel,
        })}`,
      );

      return intelligence;
    } catch (error) {
      this.logger.error(`Error getting IP intelligence for ${ip}:`, error);

      // Retour d'une réponse par défaut en cas d'erreur
      return {
        ip,
        country: 'Unknown',
        countryCode: 'XX',
        isVpn: false,
        isTor: false,
        isProxy: false,
        isHosting: false,
        threatLevel: 'low',
      };
    }
  }

  /**
   * Vérifie si une IP est dans une liste de blocage
   *
   * @param ip - Adresse IP à vérifier
   * @returns true si l'IP est bloquée
   */
  async isIpBlocked(ip: string): Promise<boolean> {
    try {
      const intelligence = await this.getIpIntelligence(ip);

      // Blocage si niveau de menace élevé
      if (intelligence.threatLevel === 'high') {
        return true;
      }

      // Blocage optionnel pour Tor (selon configuration)
      if (intelligence.isTor) {
        this.logger.warn(`Tor exit node detected: ${ip}`);
        return true; // Peut être configuré
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking IP block status for ${ip}:`, error);
      return false;
    }
  }

  /**
   * Met à jour les statistiques d'utilisation pour une IP
   *
   * @param ip - Adresse IP
   * @param event - Type d'événement (upload, download, etc.)
   */
  async recordIpActivity(ip: string, event: string): Promise<void> {
    try {
      const key = `ip_activity:${ip}:${event}`;
      const count = (await this.cacheManager.get<number>(key)) || 0;
      await this.cacheManager.set(key, count + 1, 3600 * 1000); // 1 heure

      // Détection d'activité suspecte
      if (count > 100) {
        this.logger.warn(
          `High activity detected from IP ${ip}: ${count} ${event} events`,
        );
      }
    } catch (error) {
      this.logger.error(`Error recording IP activity:`, error);
    }
  }

  /**
   * Analyse une adresse IP pour déterminer ses caractéristiques
   *
   * @param ip - Adresse IP à analyser
   * @returns Informations d'intelligence
   */
  private async analyzeIp(ip: string): Promise<IpIntelligence> {
    try {
      // Utilisation d'un service de géolocalisation gratuit (ip-api.com)
      // Note: En production, utiliser un service payant plus fiable
      const geoData = await this.getGeoData(ip);

      // Détection VPN/Proxy/Tor
      const isVpn = this.isVpnAsn(geoData.as || '');
      const isTor = this.TOR_EXIT_NODES.has(ip);
      const isProxy = await this.checkProxy(ip);
      const isHosting = this.isHostingProvider(geoData.as || '');

      // Calcul du niveau de menace
      const threatLevel = this.calculateThreatLevel({
        isVpn,
        isTor,
        isProxy,
        isHosting,
        country: geoData.countryCode,
      });

      return {
        ip,
        country: geoData.country || 'Unknown',
        countryCode: geoData.countryCode || 'XX',
        region: geoData.regionName,
        city: geoData.city,
        latitude: geoData.lat,
        longitude: geoData.lon,
        isVpn,
        isTor,
        isProxy,
        isHosting,
        threatLevel,
        isp: geoData.isp,
        organization: geoData.org,
        asn: geoData.as,
        timezone: geoData.timezone,
      };
    } catch (error) {
      this.logger.error(`Error analyzing IP ${ip}:`, error);
      throw error;
    }
  }

  /**
   * Obtient les données de géolocalisation depuis l'API
   *
   * @param ip - Adresse IP
   * @returns Données de géolocalisation
   */
  private async getGeoData(ip: string): Promise<any> {
    try {
      // Utilisation de ip-api.com (gratuit, limite 45 req/min)
      const response = await firstValueFrom(
        this.httpService.get<GeoApiResponse>(
          `http://ip-api.com/json/${ip}?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`,
        ),
      );

      if (response.data.status === 'success') {
        return response.data;
      } else {
        this.logger.warn(`Geo API failed for ${ip}: ${response.data.message}`);
        return {};
      }
    } catch (error) {
      this.logger.error(`Error getting geo data for ${ip}:`, error);
      return {};
    }
  }

  /**
   * Vérifie si une IP est un proxy connu
   *
   * @param ip - Adresse IP
   * @returns true si c'est un proxy
   */
  private async checkProxy(ip: string): Promise<boolean> {
    // Simple vérification basée sur les ports ouverts communs des proxies
    // En production, utiliser un service spécialisé
    return false;
  }

  /**
   * Met à jour la liste des noeuds de sortie Tor
   */
  private async updateTorExitNodes(): Promise<void> {
    try {
      // En production, télécharger depuis https://check.torproject.org/exit-addresses
      // Pour l'instant, liste statique d'exemple
      const torExitNodes = [
        '198.96.155.3',
        '199.87.154.255',
        '192.42.116.16',
        // ... plus de noeuds
      ];

      this.TOR_EXIT_NODES.clear();
      torExitNodes.forEach((ip) => this.TOR_EXIT_NODES.add(ip));

      this.logger.log(
        `Updated Tor exit nodes list: ${this.TOR_EXIT_NODES.size} nodes`,
      );
    } catch (error) {
      this.logger.error('Error updating Tor exit nodes:', error);
    }
  }

  /**
   * Vérifie si une IP est privée/locale
   *
   * @param ip - Adresse IP
   * @returns true si l'IP est privée
   */
  private isPrivateIp(ip: string): boolean {
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^127\./, // 127.0.0.0/8 (loopback)
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^::1$/, // IPv6 loopback
      /^fe80:/, // IPv6 link-local
      /^fc00:/, // IPv6 unique local
      /^fd00:/, // IPv6 unique local
    ];

    return privateRanges.some((range) => range.test(ip));
  }

  /**
   * Vérifie si un ASN appartient à un fournisseur VPN connu
   *
   * @param asn - Numéro ASN
   * @returns true si c'est un VPN connu
   */
  private isVpnAsn(asn: string): boolean {
    return this.VPN_ASN_LIST.some((vpnAsn) => asn.includes(vpnAsn));
  }

  /**
   * Vérifie si un ASN appartient à un hébergeur connu
   *
   * @param asn - Numéro ASN
   * @returns true si c'est un hébergeur
   */
  private isHostingProvider(asn: string): boolean {
    const hostingKeywords = ['hosting', 'cloud', 'vps', 'dedicated', 'server'];
    const asnLower = asn.toLowerCase();
    return hostingKeywords.some((keyword) => asnLower.includes(keyword));
  }

  /**
   * Calcule le niveau de menace basé sur plusieurs facteurs
   *
   * @param factors - Facteurs de risque
   * @returns Niveau de menace
   */
  private calculateThreatLevel(factors: {
    isVpn: boolean;
    isTor: boolean;
    isProxy: boolean;
    isHosting: boolean;
    country: string;
  }): 'low' | 'medium' | 'high' {
    let score = 0;

    if (factors.isTor) score += 40;
    if (factors.isProxy) score += 30;
    if (factors.isVpn) score += 20;
    if (factors.isHosting) score += 10;

    // Pays à risque (exemple simplifié)
    const highRiskCountries = ['XX', 'T1'];
    if (highRiskCountries.includes(factors.country)) {
      score += 20;
    }

    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }
}
