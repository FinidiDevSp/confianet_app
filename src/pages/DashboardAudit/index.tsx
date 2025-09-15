import React, { useEffect, useMemo, useState } from "react";
import { Card, CardBody, Col, Container, Row, Table, Spinner, Alert, Input, Label } from "reactstrap";
import { getLoggedinUser, setAuthorization } from "../../helpers/api_helper";
import axios from "axios";

type AuditRow = {
  id: string;
  org_id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_hash: string | null;
  created_at: string;
};

type Stats = Record<string, number>;

const DashboardAudit: React.FC = () => {
  const parseLogsResponse = (data: unknown): AuditRow[] => {
    if (Array.isArray(data)) return data as AuditRow[];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const items = obj['items'];
      if (Array.isArray(items)) return items as AuditRow[];
      const results = obj['results'];
      if (Array.isArray(results)) return results as AuditRow[];
    }
    return [];
  };

  const parseStatsResponse = (data: unknown): Stats => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Stats;
    }
    return {};
  };
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    // Ensure Authorization header is set from stored token
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
    let canceled = false;
    async function load() {
      try {
        setLoading(true);
        const [logsData, statsData] = await Promise.all([
          axios.get<unknown>("/api/audit/logs", {
            params: {
              limit: pageSize,
              offset: (page - 1) * pageSize,
              action: actionFilter || undefined,
              role: roleFilter || undefined,
            },
          }),
          axios.get<unknown>("/api/audit/stats"),
        ]);
        if (!canceled) {
          // NOTE: axios interceptor returns response.data directly in this app
          const rawLogs = logsData as unknown;
          const rawStats = statsData as unknown;
          setLogs(parseLogsResponse(rawLogs));
          setStats(parseStatsResponse(rawStats));
        }
      } catch (e: any) {
        if (!canceled) setError(e?.message || "Error cargando auditoria");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
    // Note: we only reload on filter changes like original behavior
  }, [actionFilter, roleFilter, page, pageSize]);

  const totalOnPage = useMemo(() => (Array.isArray(logs) ? logs.length : 0), [logs]);
  const hasPrev = page > 1;
  const hasNext = totalOnPage >= pageSize;

  return (
    <React.Fragment>
      <div className="page-content">
        <Container fluid>
          <Row>
            <Col lg={12}>
              <h4 className="mb-3">Dashboard Auditoria</h4>
            </Col>
          </Row>
          {error && (
            <Alert color="danger" isOpen transition={{ timeout: 200 }}>
              {error}
            </Alert>
          )}
          <Row className="align-items-end mb-3 g-3">
            <Col md={4} sm={6} className="mb-2">
              <Label className="me-2">Accion</Label>
              <Input
                type="select"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {Object.keys(stats).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Input>
            </Col>
            <Col md={4} sm={6} className="mb-2">
              <Label className="me-2">Rol</Label>
              <Input
                type="select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="admin">admin</option>
                <option value="responsable">responsable</option>
                <option value="investigador">investigador</option>
                <option value="auditor">auditor</option>
              </Input>
            </Col>
          </Row>
          <Row>
            <Col xl={4} lg={6} className="mb-3">
              <Card>
                <CardBody>
                  <h6 className="mb-2">Resumen</h6>
                  {loading && <Spinner size="sm" />}
                  {!loading && (
                    <ul className="mb-0">
                      <li>
                        Total eventos: {Object.values(stats).reduce((a, b) => a + b, 0)}
                      </li>
                      {Object.entries(stats).map(([k, v]) => (
                        <li key={k}>
                          {k}: {v}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </Col>
            <Col xl={8} lg={12}>
              <Card>
                <CardBody>
                  <h6 className="mb-2">Ultimos eventos</h6>
                  {loading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <div className="table-responsive">
                        <Table className="table align-middle table-nowrap mb-0">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Accion</th>
                              <th>Rol</th>
                              <th>Usuario</th>
                              <th>Org</th>
                              <th>IP (hash)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((r) => (
                              <tr key={r.id}>
                                <td>{new Date(r.created_at).toLocaleString()}</td>
                                <td>{r.action}</td>
                                <td>{r.actor_role || '-'}</td>
                                <td>{r.actor_id ? r.actor_id.slice(0, 8) + '...' : '-'}</td>
                                <td>{r.org_id ? r.org_id.slice(0, 8) + '...' : '-'}</td>
                                <td>{r.ip_hash ? r.ip_hash.slice(0, 8) + '...' : '-'}</td>
                              </tr>
                            ))}
                            {totalOnPage === 0 && (
                              <tr>
                                <td colSpan={6} className="text-center">
                                  Sin eventos
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <div className="d-flex align-items-center gap-2">
                          <span className="text-muted small">Pagina {page}</span>
                          <select
                            className="form-select form-select-sm"
                            style={{ width: 90 }}
                            value={pageSize}
                            onChange={(e) => {
                              setPage(1);
                              setPageSize(parseInt(e.target.value || '10', 10));
                            }}
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                          </select>
                        </div>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={!hasPrev || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            &laquo; Anterior
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={!hasNext || loading}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Siguiente &raquo;
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </React.Fragment>
  );
};

export default DashboardAudit;
