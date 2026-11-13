import { Body, Controller, Delete, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DeleteImagesResponseDto,
  ImageGroupsResponseDto,
  ImageItemDto,
  ImageListResponseDto,
} from './dto/image-response.dto';
import { DeleteImagesDto } from './dto/delete-images.dto';
import {
  ImageMetadataQueryDto,
  ListImagesQueryDto,
} from './dto/list-images-query.dto';
import { ImagesService } from './images.service';

@ApiTags('images')
@Controller('api/images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get('groups')
  @ApiOperation({ summary: '获取图片分组及数量统计' })
  @ApiOkResponse({ type: ImageGroupsResponseDto })
  getGroups(): Promise<ImageGroupsResponseDto> {
    return this.imagesService.getGroups();
  }

  @Get()
  @ApiOperation({
    summary: '分页查询图片列表',
    description: '支持按分组过滤、文件名搜索，以及按名称或时间排序。',
  })
  @ApiOkResponse({ type: ImageListResponseDto })
  list(@Query() query: ListImagesQueryDto): Promise<ImageListResponseDto> {
    return this.imagesService.list(query);
  }

  @Get('metadata')
  @ApiOperation({ summary: '获取单张图片的元信息（含宽高）' })
  @ApiOkResponse({ type: ImageItemDto })
  getMetadata(@Query() query: ImageMetadataQueryDto): Promise<ImageItemDto> {
    return this.imagesService.getMetadata(query.path);
  }

  @Delete()
  @ApiOperation({
    summary: '批量删除图片',
    description: '逐条返回删除结果，单张失败不会影响其他文件。',
  })
  @ApiOkResponse({ type: DeleteImagesResponseDto })
  remove(@Body() dto: DeleteImagesDto): Promise<DeleteImagesResponseDto> {
    return this.imagesService.delete(dto.paths);
  }
}
