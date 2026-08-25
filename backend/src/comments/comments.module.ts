import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { ReviewCommentsController } from "./review-comments.controller";
import { Acp, Comment, AcpAccessConfig } from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { ReviewPolicyService } from "./review-policy.service";
import { ReviewAccessGuard } from "./review-access.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([Acp, Comment, AcpAccessConfig]),
    AuthModule,
    FilesModule,
  ],
  controllers: [CommentsController, ReviewCommentsController],
  providers: [CommentsService, ReviewPolicyService, ReviewAccessGuard],
  exports: [CommentsService, ReviewPolicyService],
})
export class CommentsModule {}
