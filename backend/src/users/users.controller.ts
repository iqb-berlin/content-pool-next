import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";

@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "List all users (Admin only)" })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "Get user by ID (Admin only)" })
  async findOne(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "Create a new user (Admin only)" })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "Update user (Admin only)" })
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(":id")
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "Delete user (Admin only)" })
  async delete(@Param("id") id: string) {
    return this.usersService.delete(id);
  }

  @Patch(":id/app-admin")
  @Roles("APP_ADMIN")
  @ApiOperation({ summary: "Toggle App-Admin role (Admin only)" })
  async setAppAdmin(
    @Param("id") id: string,
    @Body("isAppAdmin") isAppAdmin: boolean,
  ) {
    return this.usersService.setAppAdmin(id, isAppAdmin);
  }
}
