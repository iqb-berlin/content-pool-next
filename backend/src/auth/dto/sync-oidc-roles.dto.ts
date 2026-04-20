import { IsString } from "class-validator";

export class SyncOidcRolesDto {
  @IsString()
  idToken!: string;
}
