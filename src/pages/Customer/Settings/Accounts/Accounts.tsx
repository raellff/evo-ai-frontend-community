import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
} from '@evoapi/design-system';
import { Building2, UserPlus, Ban, CheckCircle2 } from 'lucide-react';
import EmptyState from '@/components/base/EmptyState';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { accountService } from '@/services/account/accountService';
import usersService from '@/services/users/usersService';
import type { Account, CreateAccount } from '@/types/settings';

const EMPTY_ACCOUNT_FORM: CreateAccount = { name: '', subdomain: '', support_email: '' };
const EMPTY_USER_FORM = { name: '', email: '', role: 'agent' };

export default function Accounts() {
  const { can, isReady: permissionsReady } = useUserPermissions();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoaded = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAccount>(EMPTY_ACCOUNT_FORM);
  const [creating, setCreating] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAccount, setAssignAccount] = useState<Account | null>(null);
  const [assignForm, setAssignForm] = useState(EMPTY_USER_FORM);
  const [assigning, setAssigning] = useState(false);

  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [accountToToggle, setAccountToToggle] = useState<Account | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const canCreate = can('accounts', 'create');
  const canSuspend = can('accounts', 'suspend');
  const canActivate = can('accounts', 'activate');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await accountService.listAccounts();
      setAccounts(data);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar contas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permissionsReady || hasLoaded.current) return;
    hasLoaded.current = true;
    loadAccounts();
  }, [permissionsReady, loadAccounts]);

  const handleOpenCreate = () => {
    if (!canCreate) {
      toast.error('Você não tem permissão para criar contas');
      return;
    }
    setCreateForm(EMPTY_ACCOUNT_FORM);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!createForm.name.trim()) {
      toast.error('Informe o nome da conta');
      return;
    }

    setCreating(true);
    try {
      await accountService.createAccount({
        name: createForm.name.trim(),
        subdomain: createForm.subdomain?.trim() || undefined,
        support_email: createForm.support_email?.trim() || undefined,
      });
      toast.success('Conta criada com sucesso');
      setCreateOpen(false);
      loadAccounts();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao criar conta');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenToggleStatus = (account: Account) => {
    const isActive = account.status === 'active';
    if ((isActive && !canSuspend) || (!isActive && !canActivate)) {
      toast.error('Você não tem permissão para alterar o status desta conta');
      return;
    }
    setAccountToToggle(account);
    setStatusConfirmOpen(true);
  };

  const confirmToggleStatus = async () => {
    if (!accountToToggle) return;

    setTogglingStatus(true);
    try {
      if (accountToToggle.status === 'active') {
        await accountService.suspendAccount(accountToToggle.id);
        toast.success(`Conta ${accountToToggle.name} suspensa — acesso bloqueado para todos os usuários`);
      } else {
        await accountService.activateAccount(accountToToggle.id);
        toast.success(`Conta ${accountToToggle.name} reativada`);
      }
      setStatusConfirmOpen(false);
      setAccountToToggle(null);
      loadAccounts();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao alterar status da conta');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleOpenAssign = (account: Account) => {
    setAssignAccount(account);
    setAssignForm(EMPTY_USER_FORM);
    setAssignOpen(true);
  };

  const handleAssignSubmit = async () => {
    if (!assignAccount) return;
    if (!assignForm.name.trim() || !assignForm.email.trim()) {
      toast.error('Informe nome e email do usuário');
      return;
    }

    setAssigning(true);
    try {
      await usersService.createUser({
        name: assignForm.name.trim(),
        email: assignForm.email.trim(),
        availability: 'offline',
        role: assignForm.role,
        account_id: assignAccount.id,
      });
      toast.success(`Usuário adicionado à conta ${assignAccount.name}`);
      setAssignOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao adicionar usuário à conta');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Contas</h1>
          <p className="text-muted-foreground">Organizações cadastradas nesta instalação</p>
        </div>
        {canCreate && (
          <Button onClick={handleOpenCreate}>
            <Building2 className="h-4 w-4 mr-2" />
            Nova Conta
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">Carregando...</div>
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhuma conta encontrada"
            description={
              canCreate
                ? 'Crie a primeira conta desta instalação.'
                : 'Você não tem permissão para ver ou criar contas.'
            }
            action={canCreate ? { label: 'Nova Conta', onClick: handleOpenCreate } : undefined}
            className="h-full"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Subdomínio</TableHead>
                <TableHead>Status</TableHead>
                {(canCreate || canSuspend || canActivate) && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(account => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.subdomain || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                      {account.status}
                    </Badge>
                  </TableCell>
                  {(canCreate || canSuspend || canActivate) && (
                    <TableCell className="text-right space-x-2">
                      {canCreate && (
                        <Button variant="outline" size="sm" onClick={() => handleOpenAssign(account)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Adicionar usuário
                        </Button>
                      )}
                      {account.status === 'active'
                        ? canSuspend && (
                            <Button variant="destructive" size="sm" onClick={() => handleOpenToggleStatus(account)}>
                              <Ban className="h-4 w-4 mr-2" />
                              Suspender
                            </Button>
                          )
                        : canActivate && (
                            <Button variant="outline" size="sm" onClick={() => handleOpenToggleStatus(account)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Reativar
                            </Button>
                          )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Account Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conta</DialogTitle>
            <DialogDescription>Cria uma organização isolada, sem dados compartilhados com as demais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="account-name">Nome</Label>
              <Input
                id="account-name"
                value={createForm.name}
                onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Empresa Acme"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-subdomain">Subdomínio</Label>
              <Input
                id="account-subdomain"
                value={createForm.subdomain}
                onChange={e => setCreateForm(prev => ({ ...prev, subdomain: e.target.value }))}
                placeholder="Ex: acme"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-support-email">Email de suporte</Label>
              <Input
                id="account-support-email"
                type="email"
                value={createForm.support_email}
                onChange={e => setCreateForm(prev => ({ ...prev, support_email: e.target.value }))}
                placeholder="suporte@acme.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSubmit} disabled={creating}>
              {creating ? 'Criando...' : 'Criar Conta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User to Account Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
            <DialogDescription>
              O usuário será vinculado exclusivamente à conta {assignAccount?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="assign-name">Nome</Label>
              <Input
                id="assign-name"
                value={assignForm.name}
                onChange={e => setAssignForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-email">Email</Label>
              <Input
                id="assign-email"
                type="email"
                value={assignForm.email}
                onChange={e => setAssignForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-role">Papel</Label>
              <Select
                value={assignForm.role}
                onValueChange={value => setAssignForm(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger id="assign-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account_owner">Dono da conta</SelectItem>
                  <SelectItem value="agent">Atendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assigning}>
              Cancelar
            </Button>
            <Button onClick={handleAssignSubmit} disabled={assigning}>
              {assigning ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Activate Confirmation Dialog */}
      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accountToToggle?.status === 'active' ? 'Suspender conta' : 'Reativar conta'}
            </DialogTitle>
            <DialogDescription>
              {accountToToggle?.status === 'active'
                ? `Isso bloqueia imediatamente o acesso de todos os usuários da conta "${accountToToggle?.name}", incluindo sessões já autenticadas.`
                : `Isso libera novamente o acesso de todos os usuários da conta "${accountToToggle?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusConfirmOpen(false)} disabled={togglingStatus}>
              Cancelar
            </Button>
            <Button
              variant={accountToToggle?.status === 'active' ? 'destructive' : 'default'}
              onClick={confirmToggleStatus}
              disabled={togglingStatus}
            >
              {togglingStatus
                ? 'Aplicando...'
                : accountToToggle?.status === 'active'
                  ? 'Suspender'
                  : 'Reativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
