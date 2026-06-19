import {
  IMAGE_RELATIVE_URL,
  IMAGE_UPLOAD_DIR,
} from 'src/common/constants/upload.constants';

export const RECIPE_SORT_DEFAULT = 'name' as const;
export const RECIPE_IMAGE_UPLOAD_DIR = `${IMAGE_UPLOAD_DIR}/recipes`;
export const RECIPE_IMAGE_RELATIVE_URL = `${IMAGE_RELATIVE_URL}/recipes`;
