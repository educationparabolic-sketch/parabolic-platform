import {
  AssetBucketKey,
  InitializeCdnArchitectureRequest,
  ResolveQuestionAssetPathRequest,
  ResolveReportAssetPathRequest,
  ResolvedAssetLocation,
} from "./cdnArchitecture";

export interface StorageBucketSecurityPolicy {
  backendIamOnlyAccess: true;
  directoryListingEnabled: false;
  publicBucketAccessEnabled: false;
  uniformBucketLevelAccess: true;
}

export interface StorageBucketDirectoryDefinition {
  bucketKey: AssetBucketKey;
  bucketName: string;
  directoryTemplate: string;
  immutableObjects: boolean;
}

export type InitializeStorageBucketArchitectureRequest =
  InitializeCdnArchitectureRequest;

export interface InitializedStorageBucketArchitecture {
  buckets: Record<AssetBucketKey, StorageBucketDirectoryDefinition>;
  security: StorageBucketSecurityPolicy;
}

export interface StorageObjectTarget extends ResolvedAssetLocation {
  contentType: string;
  directoryPath: string;
  gsUri: string;
}

export interface ValidateStorageObjectPathRequest {
  bucketKey: AssetBucketKey;
  bucketName: string;
  objectPath: string;
}

export type ResolveQuestionAssetStorageTargetRequest =
  ResolveQuestionAssetPathRequest;

export type ResolveReportAssetStorageTargetRequest =
  ResolveReportAssetPathRequest;
