import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Setup from './Setup';
import { setupService } from '@/services/setup/setupService';

// t returns the key verbatim so tests can query by i18n key.
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    currentLanguage: 'pt-BR',
    changeLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/setup/setupService', () => ({
  setupService: {
    getStatus: vi.fn(),
    bootstrap: vi.fn(),
    uploadBrandingLogos: vi.fn(),
  },
}));

vi.mock('@/contexts/GlobalConfigContext', () => ({
  clearSetupCache: vi.fn(),
}));

vi.mock('@/components/AppLogo', () => ({
  AppLogo: () => <div data-testid="app-logo">Logo</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderSetup = () =>
  render(
    <MemoryRouter>
      <Setup />
    </MemoryRouter>,
  );

const fillAccount = () => {
  fireEvent.change(screen.getByLabelText('form.firstName.label'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText('form.lastName.label'), { target: { value: 'Lovelace' } });
  fireEvent.change(screen.getByLabelText('form.email.label'), { target: { value: 'ada@box.dev' } });
  fireEvent.change(screen.getByLabelText('form.password.label'), { target: { value: 'Abcd1234!' } });
  fireEvent.change(screen.getByLabelText('form.confirmPassword.label'), { target: { value: 'Abcd1234!' } });
};

const ACCOUNT = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@box.dev',
  password: 'Abcd1234!',
  password_confirmation: 'Abcd1234!',
};

describe('Setup wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setupService.bootstrap).mockResolvedValue({
      status: 'ok',
      message: 'ok',
      survey_token: null,
    });
    vi.mocked(setupService.uploadBrandingLogos).mockResolvedValue(true);
  });

  it('on a community box (whitelabel false) bootstraps directly without a branding step', async () => {
    vi.mocked(setupService.getStatus).mockResolvedValue({ status: 'inactive', instance_id: null, whitelabel: false });

    renderSetup();
    await waitFor(() => expect(setupService.getStatus).toHaveBeenCalled());

    fillAccount();
    fireEvent.click(screen.getByRole('button', { name: 'form.submit.idle' }));

    await waitFor(() => expect(setupService.bootstrap).toHaveBeenCalledWith(ACCOUNT));
    expect(screen.queryByText('brand.title')).not.toBeInTheDocument();
    expect(setupService.uploadBrandingLogos).not.toHaveBeenCalled();
  });

  it('on a whitelabel box advances to the branding step instead of bootstrapping', async () => {
    vi.mocked(setupService.getStatus).mockResolvedValue({ status: 'inactive', instance_id: null, whitelabel: true });

    renderSetup();
    await waitFor(() => expect(setupService.getStatus).toHaveBeenCalled());

    fillAccount();
    fireEvent.click(screen.getByRole('button', { name: 'form.submit.continue' }));

    await screen.findByLabelText('brand.appTitle.label');
    expect(setupService.bootstrap).not.toHaveBeenCalled();
  });

  it('skipping the branding step bootstraps with no brand fields', async () => {
    vi.mocked(setupService.getStatus).mockResolvedValue({ status: 'inactive', instance_id: null, whitelabel: true });

    renderSetup();
    await waitFor(() => expect(setupService.getStatus).toHaveBeenCalled());

    fillAccount();
    fireEvent.click(screen.getByRole('button', { name: 'form.submit.continue' }));
    await screen.findByLabelText('brand.appTitle.label');

    fireEvent.click(screen.getByRole('button', { name: 'brand.skip' }));

    await waitFor(() => expect(setupService.bootstrap).toHaveBeenCalledWith(ACCOUNT));
    expect(setupService.uploadBrandingLogos).not.toHaveBeenCalled();
  });

  it('finishing sends the captured title and colors and defaults the primary color', async () => {
    vi.mocked(setupService.getStatus).mockResolvedValue({ status: 'inactive', instance_id: null, whitelabel: true });

    renderSetup();
    await waitFor(() => expect(setupService.getStatus).toHaveBeenCalled());

    fillAccount();
    fireEvent.click(screen.getByRole('button', { name: 'form.submit.continue' }));
    await screen.findByLabelText('brand.appTitle.label');

    fireEvent.change(screen.getByLabelText('brand.appTitle.label'), { target: { value: 'Acme CRM' } });
    fireEvent.click(screen.getByRole('button', { name: 'brand.finish' }));

    await waitFor(() =>
      expect(setupService.bootstrap).toHaveBeenCalledWith({
        ...ACCOUNT,
        app_title: 'Acme CRM',
        primary_color: '#22C55E',
      }),
    );
    // No logos were selected → the best-effort upload is skipped.
    expect(setupService.uploadBrandingLogos).not.toHaveBeenCalled();
  });

  it('blocks finishing when the primary color is not a valid hex', async () => {
    vi.mocked(setupService.getStatus).mockResolvedValue({ status: 'inactive', instance_id: null, whitelabel: true });

    renderSetup();
    await waitFor(() => expect(setupService.getStatus).toHaveBeenCalled());

    fillAccount();
    fireEvent.click(screen.getByRole('button', { name: 'form.submit.continue' }));
    await screen.findByLabelText('brand.appTitle.label');

    // The swatch and the hex field share the accessible name — target the text field.
    fireEvent.change(
      screen.getByLabelText('brand.primaryColor.label', { selector: 'input[type="text"]' }),
      { target: { value: 'not-a-color' } },
    );

    expect(screen.getByRole('button', { name: 'brand.finish' })).toBeDisabled();
    expect(screen.getByText('brand.color.invalid')).toBeInTheDocument();
  });
});
