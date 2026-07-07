import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The role editor must not offer a manageable checkbox for permissions held
// regardless of the role: basic (every user) or operationally implied. Those
// render checked + disabled, are excluded from the resource "select all", and
// never reach the save payload (EVO-2060).

const bulkUpdateMock = vi.fn().mockResolvedValue({ id: 'r1', permissions_by_resource: {} });

// Stable references: loadData depends on [id, t, navigate]; fresh identities
// each render would re-fire the effect in a loop (stuck loading).
const navigateStub = vi.fn();
const tStub = (k: string) => k;
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'r1' }),
  useNavigate: () => navigateStub,
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: tStub, currentLanguage: 'en' }),
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: () => true, isReady: true, loading: false }),
}));

vi.mock('@/services/roles/rolesService', () => ({
  rolesService: {
    get: vi.fn().mockResolvedValue({
      id: 'r1',
      name: 'Agent',
      description: '',
      // The role holds NO explicit labels grant, yet labels.read is basic.
      permissions_by_resource: { labels: ['create'] },
    }),
    bulkUpdatePermissions: (...args: unknown[]) => bulkUpdateMock(...args),
  },
}));

vi.mock('@/services/permissions', () => ({
  permissionsService: {
    getResourceActions: vi.fn().mockResolvedValue({
      data: {
        resources: {
          labels: {
            name: 'Labels',
            description: '',
            actions: {
              read: { name: 'View', description: '', basic: true, implied_by: null },
              create: { name: 'Create', description: '', basic: false, implied_by: null },
            },
          },
          users: {
            name: 'Users',
            description: '',
            actions: {
              read: { name: 'View', description: '', basic: false, implied_by: 'conversations.read' },
            },
          },
        },
      },
    }),
    clearPermissionsCache: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RoleDetail from './RoleDetail';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => bulkUpdateMock.mockClear());

const cb = (key: string) => document.getElementById(key) as HTMLButtonElement | null;

describe('RoleDetail — locked basic/implied permissions', () => {
  it('renders basic (labels.read) and implied (users.read) as checked + disabled', async () => {
    render(<RoleDetail />);
    await waitFor(() => expect(cb('labels.read')).not.toBeNull());

    // Basic: checked despite the role not granting it, and not editable.
    expect(cb('labels.read')).toBeDisabled();
    expect(cb('labels.read')).toHaveAttribute('data-state', 'checked');
    // Implied by conversations.read: same treatment.
    expect(cb('users.read')).toBeDisabled();
    expect(cb('users.read')).toHaveAttribute('data-state', 'checked');
    // A genuinely managed permission stays editable.
    expect(cb('labels.create')).not.toBeDisabled();
  });

  it('excludes locked permissions from the saved payload', async () => {
    render(<RoleDetail />);
    await waitFor(() => expect(cb('labels.create')).not.toBeNull());

    await userEvent.click(screen.getByText('savePermissions'));

    await waitFor(() => expect(bulkUpdateMock).toHaveBeenCalled());
    const savedKeys = bulkUpdateMock.mock.calls[0][1] as string[];
    expect(savedKeys).toContain('labels.create');
    expect(savedKeys).not.toContain('labels.read');
    expect(savedKeys).not.toContain('users.read');
  });
});
