import { Controller, Post, Body, Get, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OidcValidationService } from './services/oidc-validation.service';
import { LoginDto, CredentialLoginDto, OidcCallbackDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './roles.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcValidationService: OidcValidationService,
  ) {}

  @Get('oidc-config')
  @ApiOperation({ summary: 'Get OIDC configuration' })
  async getOidcConfig() {
    return {
      enabled: this.oidcValidationService.isOidcEnabled(),
      issuerUrl: process.env.OIDC_ISSUER_URL || null,
      clientId: process.env.OIDC_CLIENT_ID || null,
      redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:4200/auth/callback',
      scope: process.env.OIDC_SCOPE || 'openid profile email',
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with username and password' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  @Post('oidc-callback')
  @ApiOperation({ summary: 'OIDC callback - exchange ID token for JWT' })
  async oidcCallback(@Body() oidcCallbackDto: OidcCallbackDto) {
    if (!this.oidcValidationService.isOidcEnabled()) {
      throw new UnauthorizedException('OIDC is not configured');
    }

    const userInfo = await this.oidcValidationService.validateIdToken(oidcCallbackDto.idToken);
    
    // Generate JWT for the authenticated OIDC user
    return this.authService.generateTokenForOidcUser(userInfo);
  }

  @Post('link-oidc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('APP_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a user to OIDC account (Admin only)' })
  async linkOidcAccount(@Body() body: { userId: string; oidcSub: string }) {
    return this.authService.linkOidcAccount(body.userId, body.oidcSub);
  }

  @Post('credential-login')
  @ApiOperation({ summary: 'Login with ACP credentials' })
  async credentialLogin(@Body() credentialLoginDto: CredentialLoginDto) {
    return this.authService.credentialLogin(
      credentialLoginDto.acpId,
      credentialLoginDto.username,
      credentialLoginDto.password,
    );
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.sub);
  }
}
