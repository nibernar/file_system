import { File, VersionChangeType, FileOperation } from '../file.entity';
import {
  FileMetadata,
  ProcessingStatus,
  VirusScanStatus,
  DocumentType,
} from '../../../types/file-system.types';

describe('File Entity', () => {
  let file: File;
  let mockMetadata: FileMetadata;

  beforeEach(() => {
    mockMetadata = {
      id: 'file-123',
      userId: 'user-456',
      projectId: 'project-789',
      filename: 'test-document.pdf',
      originalName: 'Test Document.pdf',
      contentType: 'application/pdf',
      size: 1048576,
      storageKey: 'files/user-456/test-document.pdf',
      cdnUrl: 'https://cdn.coders.com/test-document.pdf',
      checksumMd5: 'abc123def456',
      checksumSha256: 'sha256hash123456',
      virusScanStatus: VirusScanStatus.CLEAN,
      processingStatus: ProcessingStatus.COMPLETED,
      documentType: DocumentType.PROJECT_DOCUMENT,
      tags: ['test', 'document'],
      versionCount: 1,
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T11:00:00Z'),
      deletedAt: undefined,
    };

    file = new File('file-123', 'user-456', mockMetadata);
  });

  it('should create valid file entity', () => {
    expect(file.id).toBe('file-123');
    expect(file.userId).toBe('user-456');
    expect(file.metadata).toEqual(mockMetadata);
    expect(file.versions).toEqual([]);
    expect(file.accessLogs).toEqual([]);
    expect(() => new File('', 'user-456', mockMetadata)).toThrow();
    expect(() => new File('file-123', '', mockMetadata)).toThrow();
    const invalidMetadata = { ...mockMetadata, size: -100 };
    expect(() => new File('file-123', 'user-456', invalidMetadata)).toThrow();
  });

  it('should enforce business rules for versioning', () => {
    const description = 'Updated after review';
    const changedBy = 'user-789';
    const newVersion = file.createVersion(
      description,
      changedBy,
      VersionChangeType.MANUAL_EDIT,
    );
    expect(newVersion).toBeDefined();
    expect(newVersion.fileId).toBe(file.id);
    expect(newVersion.versionNumber).toBe(2);
    expect(newVersion.changeDescription).toBe(description);
    expect(newVersion.createdBy).toBe(changedBy);
    expect(newVersion.changeType).toBe(VersionChangeType.MANUAL_EDIT);
    expect(newVersion.isActive).toBe(true);
    expect(file.metadata.versionCount).toBe(2);
    expect(file.versions).toHaveLength(1);
    file.metadata.processingStatus = ProcessingStatus.PROCESSING;
    expect(() => file.createVersion('Test', 'user-789')).toThrow(
      'Cannot create version while file is being processed',
    );
    file.metadata.processingStatus = ProcessingStatus.COMPLETED;
    file.metadata.deletedAt = new Date();
    expect(() => file.createVersion('Test', 'user-789')).toThrow(
      'Cannot create version for deleted file',
    );
  });

  it('should validate access permissions correctly', () => {
    expect(file.canBeAccessedBy('user-456', FileOperation.READ)).toBe(true);
    expect(file.canBeAccessedBy('user-456', FileOperation.WRITE)).toBe(true);
    expect(file.canBeAccessedBy('user-456', FileOperation.DELETE)).toBe(true);
    expect(file.canBeAccessedBy('user-789', FileOperation.READ)).toBe(false);
    expect(file.canBeAccessedBy('user-789', FileOperation.WRITE)).toBe(false);
    file.metadata.deletedAt = new Date();
    expect(file.canBeAccessedBy('user-456', FileOperation.READ)).toBe(true); // Owner ok
    expect(file.canBeAccessedBy('user-789', FileOperation.READ)).toBe(false); // Others no
    file.metadata.deletedAt = undefined;
    file.metadata.virusScanStatus = VirusScanStatus.INFECTED;
    expect(file.canBeAccessedBy('user-456', FileOperation.READ)).toBe(true);
    expect(file.canBeAccessedBy('user-456', FileOperation.WRITE)).toBe(false);
    file.metadata.virusScanStatus = VirusScanStatus.CLEAN;
    file.metadata.processingStatus = ProcessingStatus.PROCESSING;
    expect(file.canBeAccessedBy('user-456', FileOperation.READ)).toBe(true);
    expect(file.canBeAccessedBy('user-456', FileOperation.WRITE)).toBe(false);
  });

  it('should emit domain events on state changes', () => {
    file.createVersion('Version 1', 'user-1');
    file.updateProcessingStatus(ProcessingStatus.PROCESSING);
    file.logAccess('user-2', FileOperation.READ, 'SUCCESS');
    const events = file.getAndClearDomainEvents();
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('FileVersionCreated');
    expect(events[1].type).toBe('FileProcessingStatusChanged');
    expect(events[2].type).toBe('FileAccessed');
    const eventsAfter = file.getAndClearDomainEvents();
    expect(eventsAfter).toHaveLength(0);
    file.updateProcessingStatus(ProcessingStatus.COMPLETED);
    const newEvents = file.getAndClearDomainEvents();
    const event = newEvents[0];

    expect(event.aggregateId).toBe(file.id);
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.payload).toBeDefined();
    expect(event.payload.newStatus).toBe(ProcessingStatus.COMPLETED);
  });
});
