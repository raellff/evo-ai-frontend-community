import { useEffect, type ReactNode } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@evoapi/design-system';
import {
  Activity,
  ArrowLeft,
  Clock,
  Loader2,
  MoreVertical,
  Save,
} from 'lucide-react';

export type JourneyEditorHeaderProps = {
  // Zone 1 — Navigation
  onBack: () => void;
  backLabel?: string;

  // Zone 2 — Identity
  title: string;
  subtitle?: string;

  // Zone 3 — Visualizar
  onViewSessions: () => void;
  viewSessionsLabel?: string;

  // Zone 3 — Configurar (slot — EnvironmentManager is a self-contained component
  // and refactoring it to accept a controlled trigger is out of scope here).
  environmentSlot?: ReactNode;

  // Zone 3 — Persistir
  onSave: () => void;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  saveLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  lastSavedFormatter?: (date: Date) => string;

  // A11y
  moreActionsLabel?: string;
};

export function JourneyEditorHeader({
  onBack,
  backLabel = 'Back',
  title,
  subtitle,
  onViewSessions,
  viewSessionsLabel = 'View sessions',
  environmentSlot,
  onSave,
  hasUnsavedChanges = false,
  isSaving = false,
  lastSaved = null,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  savedLabel = 'Saved',
  lastSavedFormatter,
  moreActionsLabel = 'More actions',
}: JourneyEditorHeaderProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        // isContentEditable is a getter in real browsers; jsdom's
        // implementation is unreliable, so also read the attribute directly.
        if (active.isContentEditable || active.getAttribute('contenteditable') === 'true') return;
      }
      onBack();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onBack]);

  const computedSaveLabel = isSaving
    ? savingLabel
    : hasUnsavedChanges
      ? saveLabel
      : savedLabel;

  const saveDisabled = !hasUnsavedChanges || isSaving;
  const saveVariant = hasUnsavedChanges && !isSaving ? 'default' : 'outline';

  return (
    <header
      className="flex items-center gap-4 bg-flow-panel-header-bg border-b border-flow-panel-divider px-4 py-3"
      role="banner"
    >
      <div data-zone="navigation" className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-2"
          aria-keyshortcuts="Escape"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Button>
      </div>

      <div className="h-6 w-px bg-flow-panel-divider" aria-hidden="true" />

      <div data-zone="identity" className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        ) : null}
      </div>

      <div data-zone="actions" className="flex items-center gap-2">
        {lastSaved ? (
          <div
            className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>
              {lastSavedFormatter ? lastSavedFormatter(lastSaved) : lastSaved.toLocaleTimeString()}
            </span>
          </div>
        ) : null}

        <div className="hidden lg:flex items-center gap-2 border-l border-flow-panel-divider pl-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewSessions}
            className="gap-2"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            {viewSessionsLabel}
          </Button>
        </div>

        {environmentSlot ? (
          <div className="flex items-center border-l border-flow-panel-divider pl-2">
            {environmentSlot}
          </div>
        ) : null}

        <div className="flex lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={moreActionsLabel}
                className="h-9 w-9"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onViewSessions} className="gap-2">
                <Activity className="h-4 w-4" aria-hidden="true" />
                {viewSessionsLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center border-l border-flow-panel-divider pl-2">
          <Button
            variant={saveVariant}
            size="sm"
            onClick={onSave}
            disabled={saveDisabled}
            className="gap-2 min-w-[100px]"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {computedSaveLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}

JourneyEditorHeader.displayName = 'JourneyEditorHeader';
