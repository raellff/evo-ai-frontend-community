import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, Globe, ArrowLeft } from 'lucide-react';

import {
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@evoapi/design-system';

import { useLanguage } from '@/hooks/useLanguage';
import { type Locale } from '@/i18n/config';
import {
  setupService,
  type BootstrapPayload,
  type BrandingLogos,
} from '@/services/setup/setupService';
import { clearSetupCache } from '@/contexts/GlobalConfigContext';

import { AppLogo } from '@/components/AppLogo';

type SetupFormData = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

const DEFAULT_PRIMARY = '#22C55E';
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const isValidHex = (value: string) => HEX_COLOR.test(value);

type Step = 'account' | 'brand';

const Setup: React.FC = () => {
  const navigate = useNavigate();
  const { t, currentLanguage, changeLanguage } = useLanguage('setup');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Whether the box supports box branding (enterprise whitelabel present). When
  // true the wizard inserts a "Sua marca" step before finishing; a community
  // install skips straight to bootstrap.
  const [whitelabel, setWhitelabel] = useState(false);
  const [step, setStep] = useState<Step>('account');
  const [account, setAccount] = useState<SetupFormData | null>(null);

  // Branding step state.
  const [appTitle, setAppTitle] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState('');
  const [logoLight, setLogoLight] = useState<File | null>(null);
  const [logoDark, setLogoDark] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);

  useEffect(() => {
    let mounted = true;
    setupService
      .getStatus()
      .then(status => {
        if (mounted) setWhitelabel(status.whitelabel === true);
      })
      .catch(() => {
        // Fail soft: if the status probe fails, hide the branding step rather
        // than showing an install-config field that would silently no-op.
        if (mounted) setWhitelabel(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setupSchema = useMemo(() => z
    .object({
      first_name: z
        .string()
        .min(1, { message: t('form.firstName.errors.required') })
        .min(2, { message: t('form.firstName.errors.minLength') }),
      last_name: z
        .string()
        .min(1, { message: t('form.lastName.errors.required') })
        .min(2, { message: t('form.lastName.errors.minLength') }),
      email: z
        .string()
        .min(1, { message: t('form.email.errors.required') })
        .email({ message: t('form.email.errors.invalid') }),
      password: z
        .string()
        .min(1, { message: t('form.password.errors.required') })
        .min(8, { message: t('form.password.errors.minLength') })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])/, {
          message: t('form.password.errors.complexity'),
        }),
      password_confirmation: z
        .string()
        .min(1, { message: t('form.confirmPassword.errors.required') }),
    })
    .refine(data => data.password === data.password_confirmation, {
      message: t('form.confirmPassword.errors.mismatch'),
      path: ['password_confirmation'],
    }), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      password_confirmation: '',
    },
  });

  // Runs the actual install. Branding fields and logos are only supplied on a
  // whitelabel box; the community path passes neither.
  const runBootstrap = async (
    data: SetupFormData,
    brand: Partial<BootstrapPayload>,
    logos?: BrandingLogos,
  ) => {
    setIsLoading(true);
    setError('');

    try {
      const result = await setupService.bootstrap({ ...data, ...brand });

      clearSetupCache();

      // Best-effort logo upload — never blocks finishing the install.
      const hasLogos = !!(logos && (logos.light || logos.dark || logos.favicon));
      if (hasLogos) {
        const ok = await setupService.uploadBrandingLogos(data.email, data.password, logos!);
        if (!ok) {
          toast.info(t('brand.logoUploadFailed'));
        }
      }

      toast.success(t('success.title'), {
        description: t('success.description'),
      });

      if (result.survey_token) {
        sessionStorage.setItem('survey_token', result.survey_token);
        navigate('/setup/onboarding', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || t('error.generic');

      if (err?.response?.status === 409) {
        setError(t('error.alreadySetup'));
      } else {
        setError(message);
      }
      // Surface the error on the account step so it is always visible.
      setStep('account');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1 submit: advance to the branding step on a whitelabel box, otherwise
  // bootstrap immediately (community behavior).
  const onAccountSubmit = (data: SetupFormData) => {
    if (whitelabel) {
      setAccount(data);
      setError('');
      setStep('brand');
    } else {
      runBootstrap(data, {});
    }
  };

  const brandPayload = (): Partial<BootstrapPayload> => {
    const payload: Partial<BootstrapPayload> = {};
    if (appTitle.trim()) payload.app_title = appTitle.trim();
    if (isValidHex(primaryColor)) payload.primary_color = primaryColor;
    if (secondaryColor.trim() && isValidHex(secondaryColor)) {
      payload.secondary_color = secondaryColor;
    }
    return payload;
  };

  // "Configurar depois" — finish without applying any branding.
  const onSkipBrand = () => {
    if (account) runBootstrap(account, {});
  };

  // "Concluir" — apply the captured branding (text persists via bootstrap,
  // logos upload best-effort).
  const onFinishBrand = () => {
    if (!account) return;
    runBootstrap(account, brandPayload(), {
      light: logoLight ?? undefined,
      dark: logoDark ?? undefined,
      favicon: favicon ?? undefined,
    });
  };

  const handleLanguageChange = (lng: string) => {
    changeLanguage(lng as Locale);
  };

  const primaryInvalid = !isValidHex(primaryColor);
  const secondaryInvalid = secondaryColor.trim().length > 0 && !isValidHex(secondaryColor);
  const brandInvalid = primaryInvalid || secondaryInvalid;

  const languageSelector = (
    <div className="absolute top-4 right-4">
      <Select value={currentLanguage} onValueChange={handleLanguageChange}>
        <SelectTrigger>
          <Globe className="h-4 w-4 text-primary" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-BR">{t('language.portuguese')}</SelectItem>
          <SelectItem value="en">{t('language.english')}</SelectItem>
          <SelectItem value="es">{t('language.spanish')}</SelectItem>
          <SelectItem value="fr">{t('language.french')}</SelectItem>
          <SelectItem value="it">{t('language.italian')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-t from-primary/20 via-background/95 to-background">
      {languageSelector}

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <AppLogo className="h-10" />
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">
              {step === 'brand' ? t('brand.title') : t('title')}
            </h1>
            <p className="text-muted-foreground">
              {step === 'brand' ? t('brand.subtitle') : t('subtitle')}
            </p>
          </div>
        </div>

        <div className="bg-background/80 backdrop-blur-sm border rounded-lg p-6 shadow-lg">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'account' ? (
            <form onSubmit={handleSubmit(onAccountSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">{t('form.firstName.label')}</Label>
                  <Input
                    id="first_name"
                    type="text"
                    placeholder={t('form.firstName.placeholder')}
                    disabled={isLoading}
                    {...register('first_name')}
                  />
                  {errors.first_name && (
                    <p className="text-destructive text-sm">{errors.first_name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="last_name">{t('form.lastName.label')}</Label>
                  <Input
                    id="last_name"
                    type="text"
                    placeholder={t('form.lastName.placeholder')}
                    disabled={isLoading}
                    {...register('last_name')}
                  />
                  {errors.last_name && (
                    <p className="text-destructive text-sm">{errors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('form.email.label')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('form.email.placeholder')}
                  disabled={isLoading}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('form.password.label')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('form.password.placeholder')}
                  disabled={isLoading}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password_confirmation">{t('form.confirmPassword.label')}</Label>
                <Input
                  id="password_confirmation"
                  type="password"
                  placeholder={t('form.confirmPassword.placeholder')}
                  disabled={isLoading}
                  {...register('password_confirmation')}
                />
                {errors.password_confirmation && (
                  <p className="text-destructive text-sm">{errors.password_confirmation.message}</p>
                )}
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading
                  ? t('form.submit.loading')
                  : whitelabel
                    ? t('form.submit.continue')
                    : t('form.submit.idle')}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app_title">{t('brand.appTitle.label')}</Label>
                <Input
                  id="app_title"
                  type="text"
                  placeholder={t('brand.appTitle.placeholder')}
                  disabled={isLoading}
                  value={appTitle}
                  maxLength={120}
                  onChange={e => setAppTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primary_color">{t('brand.primaryColor.label')}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={t('brand.primaryColor.label')}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                      value={isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY}
                      disabled={isLoading}
                      onChange={e => setPrimaryColor(e.target.value.toUpperCase())}
                    />
                    <Input
                      id="primary_color"
                      type="text"
                      placeholder={DEFAULT_PRIMARY}
                      disabled={isLoading}
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                    />
                  </div>
                  {primaryInvalid && (
                    <p className="text-destructive text-sm">{t('brand.color.invalid')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondary_color">{t('brand.secondaryColor.label')}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={t('brand.secondaryColor.label')}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                      value={isValidHex(secondaryColor) ? secondaryColor : '#000000'}
                      disabled={isLoading}
                      onChange={e => setSecondaryColor(e.target.value.toUpperCase())}
                    />
                    <Input
                      id="secondary_color"
                      type="text"
                      placeholder={t('brand.secondaryColor.placeholder')}
                      disabled={isLoading}
                      value={secondaryColor}
                      onChange={e => setSecondaryColor(e.target.value)}
                    />
                  </div>
                  {secondaryInvalid && (
                    <p className="text-destructive text-sm">{t('brand.color.invalid')}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('brand.logo.label')}</Label>
                <p className="text-muted-foreground text-xs">{t('brand.logo.hint')}</p>
                <div className="grid grid-cols-3 gap-3">
                  <LogoInput
                    id="logo_light"
                    label={t('brand.logo.light')}
                    file={logoLight}
                    disabled={isLoading}
                    onSelect={setLogoLight}
                  />
                  <LogoInput
                    id="logo_dark"
                    label={t('brand.logo.dark')}
                    file={logoDark}
                    disabled={isLoading}
                    onSelect={setLogoDark}
                  />
                  <LogoInput
                    id="favicon"
                    label={t('brand.logo.favicon')}
                    file={favicon}
                    disabled={isLoading}
                    onSelect={setFavicon}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLoading}
                  aria-label={t('brand.back')}
                  onClick={() => {
                    setError('');
                    setStep('account');
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={isLoading}
                  onClick={onSkipBrand}
                >
                  {t('brand.skip')}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={isLoading || brandInvalid}
                  onClick={onFinishBrand}
                >
                  {isLoading ? t('brand.finishLoading') : t('brand.finish')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <p>{t('footer')}</p>
        </div>
      </div>
    </div>
  );
};

interface LogoInputProps {
  id: string;
  label: string;
  file: File | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}

const LogoInput: React.FC<LogoInputProps> = ({ id, label, file, disabled, onSelect }) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-center text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <span className="px-1 truncate max-w-full">{file ? file.name : label}</span>
    </label>
    <input
      id={id}
      type="file"
      accept="image/png,image/webp"
      className="hidden"
      disabled={disabled}
      onChange={e => onSelect(e.target.files?.[0] ?? null)}
    />
  </div>
);

export default Setup;
