export interface CalibrationHistoryEntryInput {
  activatedBy: string;
  affectedInstitutes: string[];
  calibrationVersion: string;
  logId?: string;
  rollbackAvailable: boolean;
  simulationVersion?: string;
}

export interface CalibrationHistoryEntry {
  activatedBy: string;
  affectedInstitutes: string[];
  calibrationVersion: string;
  rollbackAvailable: boolean;
  simulationVersion?: string;
  timestamp: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface CalibrationHistoryEntryWrite {
  entry: CalibrationHistoryEntry;
  logId: string;
  path: string;
}

export interface CalibrationHistoryWriteResult {
  instituteHistoryPaths: string[];
  logId: string;
  vendorLogPath: string;
}
