import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  Checkbox,
} from '@evoapi/design-system';
import { useLanguage } from '@/hooks/useLanguage';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { templatesService } from '@/services/templates/templatesService';
import type {
  ExportableInventory,
  ExportSelection,
  TemplateCategory,
} from '@/types/templates';
import { TEMPLATE_CATEGORIES } from '@/types/templates';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

export default function ExportWizard({ open, onClose }: Props) {
  const { t } = useLanguage('templates');

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [inventory, setInventory] = useState<ExportableInventory | null>(null);
  const [selection, setSelection] = useState<ExportSelection>({});
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || step !== 2 || inventory) return;
    setLoadingInventory(true);
    templatesService
      .getExportableInventory()
      .then(setInventory)
      .catch(() => toast.error(t('export.errors.failed')))
      .finally(() => setLoadingInventory(false));
  }, [open, step, inventory, t]);

  const totalSelected = useMemo(() => {
    return Object.values(selection).reduce((sum, entry) => {
      if (!entry) return sum;
      if (entry.all) return sum + 1; // "all" counts as one bulk pick; refined on backend
      return sum + (entry.ids?.length ?? 0);
    }, 0);
  }, [selection]);

  const selectedCategoryCount = useMemo(() => {
    return Object.values(selection).filter((entry) => entry && (entry.all || (entry.ids?.length ?? 0) > 0)).length;
  }, [selection]);

  const toggleAll = (category: TemplateCategory, all: boolean) => {
    setSelection((prev) => ({
      ...prev,
      [category]: all ? { all: true } : {},
    }));
  };

  const toggleItem = (category: TemplateCategory, id: string) => {
    setSelection((prev) => {
      const current = prev[category] ?? {};
      const ids = new Set(current.ids ?? []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...prev, [category]: { ids: Array.from(ids) } };
    });
  };

  const handleDownload = async () => {
    if (totalSelected === 0) {
      toast.error(t('export.errors.noSelection'));
      return;
    }
    setDownloading(true);
    try {
      const blob = await templatesService.exportTemplates(
        { template_name: name, description, author },
        selection,
      );
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'template';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}.evotpl.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('export.success'));
      onClose();
    } catch {
      toast.error(t('export.errors.failed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>
            {t(`export.step${step}.title`)} ({step}/3)
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="tpl-name">{t('export.step1.name')}</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('export.step1.namePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="tpl-desc">{t('export.step1.description')}</Label>
              <Textarea
                id="tpl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('export.step1.descriptionPlaceholder')}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="tpl-author">{t('export.step1.author')}</Label>
              <Input id="tpl-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('export.step2.subtitle')}</p>
            {loadingInventory && <p className="text-sm">...</p>}
            {!loadingInventory &&
              inventory &&
              TEMPLATE_CATEGORIES.map((cat) => {
                const items = inventory[cat] ?? [];
                const entry = selection[cat] ?? {};
                const allChecked = !!entry.all;
                return (
                  <div key={cat} className="border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t(`categories.${cat}`)} ({items.length})</span>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(v) => toggleAll(cat, v === true)}
                        />
                        {t('export.step2.selectAll')}
                      </label>
                    </div>
                    {!allChecked && items.length > 0 && (
                      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {items.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={(entry.ids ?? []).includes(item.id)}
                              onCheckedChange={() => toggleItem(cat, item.id)}
                            />
                            {item.name}
                          </label>
                        ))}
                      </div>
                    )}
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {t('export.step2.noItems')}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              {t('export.step3.summary', { count: totalSelected, categoryCount: selectedCategoryCount })}
            </p>
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{t('export.step3.credentialsWarning')}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((step - 1) as Step)}>
              {t('export.step2.back')}
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={step === 1 && !name.trim()}
            >
              {t('export.step1.next')}
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleDownload} disabled={downloading || totalSelected === 0}>
              {downloading ? t('export.step3.downloading') : t('export.step3.download')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
