import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamsTable from '@/components/teams/TeamsTable';
import MacrosTable from '@/components/macros/MacrosTable';
import MacrosHeader from '@/components/macros/MacrosHeader';
import PipelinesHeader from '@/components/pipelines/PipelinesHeader';
import CannedResponsesTable from '@/components/cannedResponses/CannedResponsesTable';
import { Team } from '@/types/users';
import { Macro } from '@/types/automation';
import { CannedResponse } from '@/types/knowledge';

// Write controls must not render for a user whose can() denies the matching
// resource.action; they must render when it grants (positive control against
// a vacuous pass).
let allowed = false;

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    can: () => allowed,
    isReady: true,
    loading: false,
  }),
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));

vi.mock('@/hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDateTime: () => '2026-01-01' }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  allowed = false;
});

const noop = () => {};

const team = { id: 1, name: 'Support', members: [] } as unknown as Team;
const macro = {
  id: 1,
  name: 'Close ticket',
  visibility: 'global',
  actions: [],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
} as unknown as Macro;
const cannedResponse = {
  id: 1,
  short_code: 'hi',
  content: 'Hello',
  created_at: '2026-01-01',
} as unknown as CannedResponse;

const renderTeamsTable = () =>
  render(
    <TeamsTable
      teams={[team]}
      selectedTeams={[]}
      onSelectionChange={noop}
      onTeamClick={noop}
      onManageUsers={noop}
      onEditTeam={noop}
      onDeleteTeam={noop}
      onCreateTeam={noop}
    />,
  );

describe('write-control render gates', () => {
  it('TeamsTable renders no row-actions menu without teams write permissions', () => {
    renderTeamsTable();

    // Every row action is write-gated, so BaseTable drops the whole menu.
    expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
  });

  it('TeamsTable renders the row-actions menu when permissions grant', () => {
    allowed = true;
    renderTeamsTable();

    expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).not.toBeNull();
  });

  it('MacrosTable keeps the read action but hides execute/edit/delete without permission', async () => {
    render(
      <MacrosTable
        macros={[macro]}
        selectedMacros={[]}
        onSelectionChange={noop}
        onMacroClick={noop}
        onEditMacro={noop}
        onDeleteMacro={noop}
        onExecuteMacro={noop}
        onCreateMacro={noop}
        canEditMacro={() => allowed}
        canDeleteMacro={() => allowed}
      />,
    );

    const trigger = document.querySelector('[data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger as HTMLElement);

    expect(screen.getByText('table.actions.view')).toBeTruthy();
    expect(screen.queryByText('table.actions.execute')).toBeNull();
    expect(screen.queryByText('table.actions.edit')).toBeNull();
    expect(screen.queryByText('table.actions.delete')).toBeNull();
  });

  it('CannedResponsesTable renders no row actions without write permissions', () => {
    render(
      <CannedResponsesTable
        cannedResponses={[cannedResponse]}
        selectedCannedResponses={[]}
        loading={false}
        onSelectionChange={noop}
        onEditCannedResponse={noop}
        onDeleteCannedResponse={noop}
        onCreateCannedResponse={noop}
        sortBy="short_code"
        sortOrder="asc"
        onSort={noop}
      />,
    );

    expect(document.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
  });

  it('MacrosHeader hides the create and bulk-delete controls without permission', () => {
    render(
      <MacrosHeader
        totalCount={1}
        selectedCount={1}
        searchValue=""
        onSearchChange={noop}
        onNewMacro={noop}
        onBulkDelete={noop}
        onFilter={noop}
        onClearSelection={noop}
        activeFilters={[]}
      />,
    );

    expect(screen.queryByText('header.newMacro')).toBeNull();
    expect(screen.queryByText('header.bulkDelete')).toBeNull();
  });

  it('PipelinesHeader shows the create button only with pipelines.create', () => {
    const { unmount } = render(
      <PipelinesHeader totalCount={0} searchValue="" onSearchChange={noop} onNewPipeline={noop} />,
    );
    expect(screen.queryByText('pipelinesHeader.newPipeline')).toBeNull();
    unmount();

    allowed = true;
    render(
      <PipelinesHeader totalCount={0} searchValue="" onSearchChange={noop} onNewPipeline={noop} />,
    );
    expect(screen.getByText('pipelinesHeader.newPipeline')).toBeTruthy();
  });
});
