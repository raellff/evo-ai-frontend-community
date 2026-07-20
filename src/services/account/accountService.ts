import authApi from '@/services/core/apiAuth';
import api from '@/services/core/api';
import { extractData } from '@/utils/apiHelpers';
import type { Account, UpdateAccount, CreateAccount, FormDataOptions, AccountUpdateResponse } from '@/types/settings';
import { extractError } from '@/utils/apiHelpers';
import { fetchGlobalConfig } from '@/contexts/GlobalConfigContext';

class AccountService {
  async getAccount(): Promise<Account> {
    try {
      const response = await authApi.get<{ account: Account }>('/account');
      return extractData<Account>(response);
    } catch (error: any) {
      console.error('Erro ao buscar conta:', error);
      throw new Error(error?.response?.data?.message || 'Erro ao buscar conta');
    }
  }

  async createAccount(payload: CreateAccount): Promise<Account> {
    try {
      const response = await authApi.post('/accounts', { account: payload });
      return extractData<Account>(response);
    } catch (error: any) {
      console.error('Erro ao criar conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao criar conta');
    }
  }

  // Superadmin-only: list every Account in the installation.
  async listAccounts(): Promise<Account[]> {
    try {
      const response = await authApi.get('/accounts');
      const data = extractData<{ accounts: Account[] }>(response);
      return data?.accounts || [];
    } catch (error: any) {
      console.error('Erro ao listar contas:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao listar contas');
    }
  }

  // Superadmin-only: suspend an Account, blocking access for it and its users.
  async suspendAccount(accountId: string): Promise<Account> {
    try {
      const response = await authApi.post(`/accounts/${accountId}/suspend`);
      return extractData<Account>(response);
    } catch (error: any) {
      console.error('Erro ao suspender conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao suspender conta');
    }
  }

  // Superadmin-only: reactivate a previously suspended Account.
  async activateAccount(accountId: string): Promise<Account> {
    try {
      const response = await authApi.post(`/accounts/${accountId}/activate`);
      return extractData<Account>(response);
    } catch (error: any) {
      console.error('Erro ao ativar conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao ativar conta');
    }
  }

  // Superadmin-only: read an Account's current per-feature overrides. See
  // specs/account-feature-toggles. Absence of a key means the feature is at
  // its config/features.yml installation default.
  async getAccountFeatures(accountId: string): Promise<Record<string, boolean>> {
    try {
      const response = await authApi.get(`/accounts/${accountId}/features`);
      const data = extractData<{ feature_overrides: Record<string, boolean> }>(response);
      return data?.feature_overrides || {};
    } catch (error: any) {
      console.error('Erro ao buscar features da conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao buscar features da conta');
    }
  }

  // Superadmin-only: partially update an Account's feature overrides. Merges
  // into the existing map - unspecified keys are left untouched; a `null`
  // value for a key removes the override, reverting to the installation
  // default.
  async updateAccountFeatures(
    accountId: string,
    overrides: Record<string, boolean | null>
  ): Promise<Record<string, boolean>> {
    try {
      const response = await authApi.patch(`/accounts/${accountId}/features`, {
        feature_overrides: overrides,
      });
      const data = extractData<{ feature_overrides: Record<string, boolean> }>(response);
      return data?.feature_overrides || {};
    } catch (error: any) {
      console.error('Erro ao atualizar features da conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao atualizar features da conta');
    }
  }

  async updateAccount(payload: UpdateAccount): Promise<Account> {
    try {
      const response = await authApi.patch<AccountUpdateResponse>('/account', { account: payload });
      return extractData<Account>(response);
    } catch (error: any) {
      console.error('Erro ao atualizar conta:', error);
      const errorInfo = extractError(error);
      throw new Error(errorInfo.message || 'Erro ao atualizar conta');
    }
  }

  // Buscar dados necessários para os formulários
  async getFormData(): Promise<FormDataOptions> {
    try {
      const [inboxesRes, agentsRes, teamsRes, labelsRes] = await Promise.allSettled([
        api.get('/inboxes'),
        authApi.get('/users'),
        api.get('/teams'),
        api.get('/labels'),
      ]);

      const getResultData = (result: PromiseSettledResult<any>, isAuthService = false) => {
        if (result.status === 'fulfilled') {
          const data = extractData(result.value);
          if (isAuthService) {
            // Auth service may return { users: [...] }
            return (data as any)?.users || data || [];
          }
          return Array.isArray(data) ? data : [];
        }
        return [];
      };

      return {
        inboxes: getResultData(inboxesRes),
        agents: getResultData(agentsRes, true), // true = isAuthService
        teams: getResultData(teamsRes),
        labels: getResultData(labelsRes),
      };
    } catch (error: any) {
      console.error('Erro ao buscar dados do formulário:', error);
      // Retornar dados vazios em caso de erro para não quebrar o formulário
      return {
        inboxes: [],
        agents: [],
        teams: [],
        labels: [],
      };
    }
  }

  // Buscar informações globais do sistema
  // Reutiliza o cache do GlobalConfigContext para evitar chamadas duplicadas
  async getGlobalConfig(): Promise<{
    appVersion?: string;
    gitSha?: string;
    isOnEvolutionCloud?: boolean;
    deploymentEnv?: string;
    brandName?: string;
    installationName?: string;
  }> {
    try {
      // Reutilizar o cache do GlobalConfigContext (evita chamada duplicada)
      const globalConfig = await fetchGlobalConfig();

      return {
        appVersion: import.meta.env.VITE_APP_VERSION || '3.0.0',
        gitSha: import.meta.env.VITE_GIT_SHA || 'unknown',
        isOnEvolutionCloud: globalConfig.hasEvolutionConfig === true || globalConfig.hasEvolutionGoConfig === true || false,
        deploymentEnv: import.meta.env.MODE || 'development',
        brandName: 'Evolution',
        installationName: 'Evolution',
      };
    } catch (error: any) {
      console.error('Erro ao buscar configuração global:', error);
      // Fallback para valores padrão em caso de erro
      return {
        appVersion: import.meta.env.VITE_APP_VERSION || '3.0.0',
        gitSha: import.meta.env.VITE_GIT_SHA || 'unknown',
        isOnEvolutionCloud: false,
        deploymentEnv: import.meta.env.MODE || 'development',
        brandName: 'Evolution',
        installationName: 'Evolution',
      };
    }
  }
}

export const accountService = new AccountService();
