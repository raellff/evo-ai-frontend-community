import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Webhook } from 'lucide-react';
import { NodeConfigModal } from './NodeConfigModal';

const meta: Meta<typeof NodeConfigModal> = {
  title: 'Flow Builder/NodeConfigModal',
  component: NodeConfigModal,
  parameters: {
    docs: {
      description: {
        component:
          'Shared modal chrome for any Flow Builder node configuration form. ' +
          'Discriminated-union API: `variant="simple"` (80% of nodes), `variant="tabs"` ' +
          '(basic/advanced split), or `variant="disclosure"` (body + collapsible advanced ' +
          'settings). Focus trap + ESC + ARIA come from the underlying `@evoapi/design-system` ' +
          'Dialog primitive (Radix). Lifted state mandatory — every prop is controlled by the ' +
          'consumer; the component itself holds no useState.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['simple', 'tabs', 'disclosure'],
    },
    dirty: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export default meta;

type Story = StoryObj<typeof NodeConfigModal>;

function BasicBody() {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">Event name</label>
      <input
        type="text"
        defaultValue="contact.created"
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Canonical event name from the manifest. Use lowercase dotted form.
      </p>
    </div>
  );
}

function AdvancedBody() {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">Custom payload filter</label>
      <textarea
        rows={3}
        defaultValue=""
        placeholder='e.g. payload.priority === "high"'
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
      />
    </div>
  );
}

export const SimpleDirty: Story = {
  name: 'Simple — dirty (Save enabled)',
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <NodeConfigModal
        open={open}
        onCancel={() => setOpen(false)}
        onSave={() => setOpen(false)}
        variant="simple"
        title="Send message"
        description="Configure the message that will be sent on this branch."
        icon={<Webhook className="h-5 w-5 text-flow-node-action-message-fg" />}
        dirty
      >
        <BasicBody />
      </NodeConfigModal>
    );
  },
};

export const SimplePristine: Story = {
  name: 'Simple — pristine (Save disabled)',
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <NodeConfigModal
        open={open}
        onCancel={() => setOpen(false)}
        onSave={() => setOpen(false)}
        variant="simple"
        title="Send message"
        description="Save stays disabled until the form is dirty."
        dirty={false}
      >
        <BasicBody />
      </NodeConfigModal>
    );
  },
};

export const SimpleLoading: Story = {
  name: 'Simple — loading (both buttons disabled, spinner on Save)',
  render: function Render() {
    return (
      <NodeConfigModal
        open
        onCancel={() => undefined}
        onSave={() => undefined}
        variant="simple"
        title="Send message"
        description="Both Save and Cancel are disabled while loading."
        dirty
        loading
      >
        <BasicBody />
      </NodeConfigModal>
    );
  },
};

export const Tabs: Story = {
  name: 'Tabs — basic / advanced',
  render: function Render() {
    const [open, setOpen] = useState(true);
    const [currentTab, setCurrentTab] = useState('basic');
    return (
      <NodeConfigModal
        open={open}
        onCancel={() => setOpen(false)}
        onSave={() => setOpen(false)}
        variant="tabs"
        title="Trigger event"
        description="Basic settings configure the event; advanced exposes filters."
        dirty
        onTabChange={setCurrentTab}
        defaultTab={currentTab}
        tabs={[
          { value: 'basic', label: 'Basic', content: <BasicBody /> },
          { value: 'advanced', label: 'Advanced', content: <AdvancedBody /> },
        ]}
      />
    );
  },
};

export const Disclosure: Story = {
  name: 'Disclosure — body + collapsible advanced',
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <NodeConfigModal
        open={open}
        onCancel={() => setOpen(false)}
        onSave={() => setOpen(false)}
        variant="disclosure"
        title="Wait condition"
        description="Default fields visible; advanced exposes optional filters."
        dirty
        advanced={<AdvancedBody />}
      >
        <BasicBody />
      </NodeConfigModal>
    );
  },
};

export const DisclosureOpen: Story = {
  name: 'Disclosure — advanced open by default',
  render: function Render() {
    return (
      <NodeConfigModal
        open
        onCancel={() => undefined}
        onSave={() => undefined}
        variant="disclosure"
        title="Wait condition"
        defaultAdvancedOpen
        advancedLabel="Show fewer fields"
        dirty
        advanced={<AdvancedBody />}
      >
        <BasicBody />
      </NodeConfigModal>
    );
  },
};
