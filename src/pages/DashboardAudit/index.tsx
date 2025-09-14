import React, { useEffect, useMemo, useState } from "react";
import { Card, CardBody, Col, Container, Row, Table, Spinner, Alert } from "reactstrap";
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

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        setLoading(true);
        const [logsRes, statsRes] = await Promise.all([
          axios.get<AuditRow[]>("/api/audit/logs", { params: { limit: 25 } }),
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
  }, []);

  const total = useMemo(() => logs.length, [logs]);

  return (
    <React.Fragment>
      <div className="page-content">
        <Container fluid>
          <Row>
            <Col lg={12}>
              <h4 className="mb-3">Dashboard Auditoría</h4>
            </Col>
          </Row>
          {error && <Alert color="danger">{error}</Alert>}
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
                            <th>Acción</th>
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
                          {total === 0 && (
                            <tr><td colSpan={6} className="text-center">Sin eventos</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
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

