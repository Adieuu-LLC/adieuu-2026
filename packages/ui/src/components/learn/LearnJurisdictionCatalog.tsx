import { useEffect, useMemo, useState } from 'react';
import { createApiClient, type PublicJurisdictionRequirement } from '@adieuu/shared';
import { useAppConfig } from '../../config/PlatformContext';
import { JurisdictionRequirementsList } from '../compliance/JurisdictionRequirementsList';

export function LearnJurisdictionCatalog() {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [rows, setRows] = useState<PublicJurisdictionRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    void (async () => {
      const res = await api.geo.getJurisdictionRequirementsCatalog();
      if (cancelled) return;

      if (res.success && res.data) {
        setRows(res.data);
        setError(false);
      } else {
        setRows([]);
        setError(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <div className="learn-jurisdiction-catalog">
      <JurisdictionRequirementsList
        rows={rows}
        loading={loading}
        error={error}
        showFilter
        emptyMessageKey="compliance.jurisdictionRequirement.catalogEmpty"
      />
    </div>
  );
}
