import {RuntimeEnvironment} from "./environment";

export interface SyntheticStudentBehaviorProfile {
  baselineAbility: number;
  disciplineProfile: number;
  fatigueFactor: number;
  impulsivenessScore: number;
  overconfidenceScore: number;
  topicStrengthMap: Record<string, number>;
}

export interface SyntheticStudentDocument
extends SyntheticStudentBehaviorProfile {
  generatedAt: FirebaseFirestore.FieldValue;
  name: string;
  simulationId: string;
  simulationVersion: string;
  status: "active";
  studentId: string;
}

export interface GenerateSyntheticStudentsInput {
  nodeEnv: RuntimeEnvironment;
  simulationId: string;
  topicIds?: string[];
}

export interface GenerateSyntheticStudentsResult {
  existingCount: number;
  generatedCount: number;
  instituteId: string;
  simulationId: string;
  simulationVersion: string;
  studentsPath: string;
  topicIds: string[];
  totalStudentCount: number;
}

export interface GenerateSyntheticStudentsSuccessResponse {
  code: "OK";
  data: GenerateSyntheticStudentsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
