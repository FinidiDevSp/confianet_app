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
        const [logsRes, statsRes] = await Promise.all([
          axios.get<AuditRow[]>("/api/audit/logs", { params: { limit: pageSize, offset: (page - 1) * pageSize, action: actionFilter || undefined, role: roleFilter || undefined } }),
          axios.get<Stats>("/api/audit/stats"),
        ]);
        if (!canceled) {
          setLogs(logsRes as unknown as AuditRow[]);
          setStats(statsRes as unknown as Stats);
        }
      } catch (e: any) {
        if (!canceled) setError(e?.message || "Error cargando auditoría");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => { canceled = true; };
  }, [actionFilter, roleFilter]);

  const totalOnPage = useMemo(() => logs.length, [logs]);
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
          {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}
          <Row className="align-items-end mb-3 g-3">
            <Col md={4} sm={6} className="mb-2">
              <Label className="me-2">Accion</Label>
              <Input type="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">Todas</option>
                {Object.keys(stats).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Input>
            </Col>
            <Col md={4} sm={6} className="mb-2">
              <Label className="me-2">Rol</Label>
              <Input type="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
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
                      <li>Total eventos: {Object.values(stats).reduce((a, b) => a + b, 0)}</li>
                      {Object.entries(stats).map(([k, v]) => (
                        <li key={k}>{k}: {v}</li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </Col>
            <Col xl={8} lg={12}>
              <Card>
                <CardBody>
                  <h6 className="mb-2">Últimos eventos</h6>
                  {loading ? (
                    <Spinner size="sm" />
                  ) : (
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
                              <td>{r.actor_id ? r.actor_id.slice(0, 8) + '…' : '-'}</td>
                              <td>{r.org_id ? r.org_id.slice(0, 8) + '…' : '-'}</td>
                              <td>{r.ip_hash ? r.ip_hash.slice(0, 8) + '…' : '-'}</td>
                            </tr>
                          ))}
                          {totalOnPage === 0 && (
                            <tr><td colSpan={6} className="text-center">Sin eventos</td></tr>
                          )}
                        </tbody>
                      </Table></div>\n                    <div className="d-flex justify-content-between align-items-center mt-3">\n                      <div className="d-flex align-items-center gap-2">\n                        <span className="text-muted small">Pagina {page}</span>\n                        <select className="form-select form-select-sm" style={{ width: 90 }} value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value || "10", 10)); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select>\n                      </div>\n                      <div className="d-flex gap-2">\n                        <button className="btn btn-sm btn-secondary" disabled={!hasPrev || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>� Anterior</button>\n                        <button className="btn btn-sm btn-secondary" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>Siguiente �</button>\n                      </div>\n                    </div>\n                  )}
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








