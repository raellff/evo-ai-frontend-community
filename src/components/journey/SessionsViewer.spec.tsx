import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionsViewer } from './SessionsViewer';

vi.mock('@/services', () => ({
  journeyService: {
    getJourneySessions: vi.fn(),
    getJourneySessionStats: vi.fn(),
  },
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    currentLanguage: 'pt-BR',
    changeLanguage: () => undefined,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { journeyService } from '@/services';

const baseProps = {
  journeyId: 'journey-1',
  journeyName: 'Test Journey',
  onClose: () => undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionsViewer — defensive stats handling', () => {
  it('renders the correct counts when the backend returns a fully populated byStatus map', async () => {
    vi.mocked(journeyService.getJourneySessions).mockResolvedValue({
      data: { sessions: [], total: 0 },
    } as never);
    vi.mocked(journeyService.getJourneySessionStats).mockResolvedValue({
      data: {
        total: 12,
        byStatus: { active: 3, waiting: 2, paused: 1, completed: 4, failed: 1, cancelled: 1 },
      },
    } as never);

    render(<SessionsViewer {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeTruthy();
    });
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('does NOT crash when stats has no byStatus field and renders zeros instead', async () => {
    vi.mocked(journeyService.getJourneySessions).mockResolvedValue({
      data: { sessions: [], total: 0 },
    } as never);
    vi.mocked(journeyService.getJourneySessionStats).mockResolvedValue({
      data: { total: 0 },
    } as never);

    expect(() => render(<SessionsViewer {...baseProps} />)).not.toThrow();

    await waitFor(() => {
      const zeros = screen.getAllByText('0');
      // total + 6 status cards (active, waiting, paused doesn't render in JSX
      // but completed, failed, cancelled do — so 5 zero cards on top of `total`)
      expect(zeros.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('does NOT crash when stats is an empty object and renders zeros', async () => {
    vi.mocked(journeyService.getJourneySessions).mockResolvedValue({
      data: { sessions: [], total: 0 },
    } as never);
    vi.mocked(journeyService.getJourneySessionStats).mockResolvedValue({
      data: {},
    } as never);

    expect(() => render(<SessionsViewer {...baseProps} />)).not.toThrow();

    await waitFor(() => {
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(5);
    });
  });

  it('does NOT crash when byStatus is partial (missing some statuses) — missing ones render as 0', async () => {
    vi.mocked(journeyService.getJourneySessions).mockResolvedValue({
      data: { sessions: [], total: 0 },
    } as never);
    vi.mocked(journeyService.getJourneySessionStats).mockResolvedValue({
      data: {
        total: 5,
        byStatus: { active: 5 },
      },
    } as never);

    expect(() => render(<SessionsViewer {...baseProps} />)).not.toThrow();

    await waitFor(() => {
      // Both `total: 5` and `byStatus.active: 5` render "5"
      expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(2);
    });
    // waiting, completed, failed, cancelled should all be 0
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT render the stats grid when the stats request fails (stats stays null)', async () => {
    vi.mocked(journeyService.getJourneySessions).mockResolvedValue({
      data: { sessions: [], total: 0 },
    } as never);
    vi.mocked(journeyService.getJourneySessionStats).mockRejectedValue(
      new Error('boom'),
    );

    const { container } = render(<SessionsViewer {...baseProps} />);

    await waitFor(() => {
      // The stats grid is conditional on `{stats && ...}` — when load fails,
      // the grid simply doesn't render. We assert by checking that no
      // `text-2xl font-bold` count card is in the DOM.
      expect(container.querySelectorAll('.text-2xl.font-bold')).toHaveLength(0);
    });
  });
});
