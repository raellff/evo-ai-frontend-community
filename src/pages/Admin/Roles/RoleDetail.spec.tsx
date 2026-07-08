import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The role editor must not offer a manageable checkbox for a permission held
// regardless of the role. `basic` (every user) is always locked. `implied_by`
// is global catalog metadata, so it locks the checkbox ONLY when this role
// actually holds the source grant; otherwise the implied permission is a
// normal, editable grant. Locked permissions render checked + disabled and
// never reach the save payload.

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

// Mutable so each test can seed the role's real grants before rendering.
let rolePermissions: Record<string, string[]> = { labels: ['create'] };

vi.mock('@/services/roles/rolesService', () => ({
  rolesService: {
    get: vi.fn().mockImplementation(() =>
      Promise.resolve({
        id: 'r1',
        name: 'Agent',
        description: '',
        permissions_by_resource: rolePermissions,
      }),
    ),
    bulkUpdatePermissions: (...args: unknown[]) => bulkUpdateMock(...args),
  },
}));

vi.mock('@/services/permissions', () => ({
  permissionsService: {
    getResourceActions: vi.fn().mockResolvedValue({
      data: {
        resources: {
          conversations: {
            name: 'Conversations',
            description: '',
            actions: {
              read: { name: 'View', description: '', basic: false, implied_by: null },
            },
          },
          labels: {
            name: 'Labels',
            description: '',
            actions: {
              read: { name: 'View', description: '', basic: true, implied_by: null },
              create: { name: 'Create', description: '', basic: false, implied_by: null },
            },
          },
          users: {
            // users.read is only carried operationally by conversations.read.
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

beforeEach(() => {
  bulkUpdateMock.mockClear();
  rolePermissions = { labels: ['create'] };
});

const cb = (key: string) => document.getElementById(key) as HTMLButtonElement | null;

describe('RoleDetail — locked basic/implied permissions', () => {
  it('locks basic always, but leaves an implied permission editable when its source is not held', async () => {
    // Role holds labels.create only (no conversations.read).
    render(<RoleDetail />);
    await waitFor(() => expect(cb('labels.read')).not.toBeNull());

    // Basic: checked despite the role not granting it, and not editable.
    expect(cb('labels.read')).toBeDisabled();
    expect(cb('labels.read')).toHaveAttribute('data-state', 'checked');

    // Implied by a grant this role does NOT hold → a normal, editable checkbox
    // reflecting its real (ungranted) state.
    expect(cb('users.read')).not.toBeDisabled();
    expect(cb('users.read')).toHaveAttribute('data-state', 'unchecked');

    // A genuinely managed permission stays editable.
    expect(cb('labels.create')).not.toBeDisabled();
  });

  it('locks/unlocks the implied permission reactively as its source is toggled', async () => {
    render(<RoleDetail />);
    await waitFor(() => expect(cb('users.read')).not.toBeNull());

    // Source absent → implied editable.
    expect(cb('users.read')).not.toBeDisabled();

    // Grant the source → implied becomes locked + checked.
    await userEvent.click(cb('conversations.read') as HTMLElement);
    await waitFor(() => expect(cb('users.read')).toBeDisabled());
    expect(cb('users.read')).toHaveAttribute('data-state', 'checked');

    // Revoke the source → implied is editable again.
    await userEvent.click(cb('conversations.read') as HTMLElement);
    await waitFor(() => expect(cb('users.read')).not.toBeDisabled());
  });

  it('excludes an implied permission from the payload while its source is held', async () => {
    // Role holds the source grant, so users.read is locked (backend-derived).
    rolePermissions = { conversations: ['read'], labels: ['create'] };
    render(<RoleDetail />);
    await waitFor(() => expect(cb('users.read')).not.toBeNull());

    expect(cb('users.read')).toBeDisabled();
    expect(cb('users.read')).toHaveAttribute('data-state', 'checked');

    await userEvent.click(screen.getByText('savePermissions'));

    await waitFor(() => expect(bulkUpdateMock).toHaveBeenCalled());
    const savedKeys = bulkUpdateMock.mock.calls[0][1] as string[];
    expect(savedKeys).toContain('conversations.read');
    expect(savedKeys).toContain('labels.create');
    // Locked (implied + basic) keys are never persisted as role grants.
    expect(savedKeys).not.toContain('users.read');
    expect(savedKeys).not.toContain('labels.read');
  });

  it('persists an implied permission when checked without its source held', async () => {
    render(<RoleDetail />);
    await waitFor(() => expect(cb('users.read')).not.toBeNull());

    // Source absent → the implied checkbox is a real grant the user can set.
    await userEvent.click(cb('users.read') as HTMLElement);
    expect(cb('users.read')).toHaveAttribute('data-state', 'checked');

    await userEvent.click(screen.getByText('savePermissions'));

    await waitFor(() => expect(bulkUpdateMock).toHaveBeenCalled());
    const savedKeys = bulkUpdateMock.mock.calls[0][1] as string[];
    expect(savedKeys).toContain('users.read');
    expect(savedKeys).toContain('labels.create');
    expect(savedKeys).not.toContain('labels.read');
  });
});
