import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDataStore } from '@/store/appDataStore';
import { useFeatures } from '@/hooks/useAccount';
import type { AccountFeatures } from '@/types/settings';

interface FeatureRouteProps {
  children: React.ReactNode;
  feature: keyof AccountFeatures;
  redirectTo?: string;
}

/**
 * Protege uma rota com base nas feature flags por Conta (ver
 * specs/account-feature-toggles), de forma independente das permissões
 * checadas por PermissionRoute - as duas são compostas, não alternativas.
 *
 * Ex.:
 * <PermissionRoute resource="pipelines" action="read">
 *   <FeatureRoute feature="pipelines">
 *     <Pipelines />
 *   </FeatureRoute>
 * </PermissionRoute>
 */
const FeatureRoute: React.FC<FeatureRouteProps> = ({ children, feature, redirectTo = '/unauthorized' }) => {
  const navigate = useNavigate();
  const account = useAppDataStore(state => state.account);
  const { isFeatureEnabled } = useFeatures(account);

  // account ainda não carregado: não bloqueia o render (evita redirecionar
  // por engano antes do fetch terminar); uma vez carregado, se a feature
  // estiver desabilitada, redireciona.
  const blocked = !!account && !isFeatureEnabled(feature);

  useEffect(() => {
    if (blocked) {
      navigate(redirectTo, { replace: true });
    }
  }, [blocked, navigate, redirectTo]);

  if (blocked) {
    return null;
  }

  return <>{children}</>;
};

export default FeatureRoute;
