import { IMAGE_RELATIVE_URL } from 'src/common/constants/upload.constants';

import { BatchStatus } from './batches.type';

export const batchStatuses: BatchStatus[] = [
  'planned',
  'in-progress',
  'finished',
];

export const BATCH_IMAGE_RELATIVE_URL = `${IMAGE_RELATIVE_URL}/batches`;
export const IMAGE_MAX_FILES_PER_BATCH = 5;
