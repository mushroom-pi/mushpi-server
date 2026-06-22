import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiBatchImageErrors } from 'src/common/decorators/docs/api-batch-image.decorator';
import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { GetBatch } from 'src/common/decorators/get-batch.decorator';
import { BatchImagesUploadInterceptor } from 'src/common/interceptors/batch-images-upload.interceptor';

import { Batch } from '../batches.entity';
import { BatchesService } from '../batches.service';

@ApiTags('batches', 'images')
@Controller('batches/:batchId/images')
@ApiBatch()
export class BatchIdImagesController {
  constructor(private readonly svc: BatchesService) {}

  @Put()
  @ApiOperation({
    summary: 'Upload batch images',
    description:
      'Append uploaded images to the batch (max 5 total). Rejects if the batch already has 5 images.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Image files (JPEG or PNG, max 5MB each)',
          maxItems: 5,
        },
      },
      required: ['images'],
    },
  })
  @ApiOkResponse({ type: Batch, description: 'Images added successfully' })
  @ApiBatchImageErrors()
  @UseInterceptors(BatchImagesUploadInterceptor)
  addImages(
    @GetBatch() batch: Batch,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.svc.addImages(batch, files ?? []);
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a batch image by filename' })
  @ApiNoContentResponse({ description: 'Image removed successfully' })
  @ApiBatchImageErrors()
  removeImage(@GetBatch() batch: Batch, @Param('filename') filename: string) {
    return this.svc.removeImage(batch, filename);
  }
}
