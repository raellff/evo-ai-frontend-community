import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  automationRuleSchema,
  type AutomationRuleFormData,
} from '@/pages/Customer/Automation/registries';
import ConditionRow from './ConditionRow';
import type { AutomationFormData } from '@/hooks/automation/useAutomationFormData';

const emptyFormData: AutomationFormData = {
  inboxes: [],
  agents: [],
  teams: [],
  labels: [],
  pipelines: [],
  pipelineStages: [],
  priorities: [],
  statuses: [],
  messageTypes: [],
};

function Wrapper({ defaultValues }: { defaultValues: AutomationRuleFormData }) {
  const methods = useForm<AutomationRuleFormData>({
    resolver: zodResolver(automationRuleSchema),
    defaultValues,
  });
  return (
    <FormProvider {...methods}>
      <ConditionRow control={methods.control} index={0} formData={emptyFormData} onRemove={() => {}} />
    </FormProvider>
  );
}

describe('ConditionRow', () => {
  it('renders without crashing for an empty condition', () => {
    const defaults: AutomationRuleFormData = {
      name: 'Test',
      description: '',
      event_name: 'conversation_created',
      active: true,
      mode: 'simple',
      conditions: [
        {
          attribute_key: '',
          filter_operator: 'equal_to',
          query_operator: 'AND',
          values: [],
        },
      ],
      actions: [
        {
          action_name: 'send_message',
          action_params: ['hello'],
        },
      ],
    };
    render(<Wrapper defaultValues={defaults} />);
    expect(screen.getByText(/form\.fields\.conditionRow\.attribute/)).toBeTruthy();
  });

  it('renders From and To labels when filter_operator is attribute_changed', () => {
    const defaults: AutomationRuleFormData = {
      name: 'Test',
      description: '',
      event_name: 'conversation_updated',
      active: true,
      mode: 'simple',
      conditions: [
        {
          attribute_key: 'status',
          filter_operator: 'attribute_changed',
          query_operator: 'AND',
          values: { from: [], to: [] },
        },
      ],
      actions: [
        {
          action_name: 'send_message',
          action_params: ['hello'],
        },
      ],
    };
    render(<Wrapper defaultValues={defaults} />);
    expect(screen.getAllByText(/form\.fields\.conditionRow\.from/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/form\.fields\.conditionRow\.to/).length).toBeGreaterThan(0);
  });
});
