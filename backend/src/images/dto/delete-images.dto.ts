import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class DeleteImagesDto {
  @ApiProperty({
    description: '要删除的图片相对路径列表',
    type: [String],
    example: ['example-com/a.jpg', 'example-com/b.png'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  paths!: string[];
}
