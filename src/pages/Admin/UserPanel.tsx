import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Container, Form, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner, Table } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

const UserPanel: React.FC = () => {
  const [me, setMe] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [targetUserId, setTargetUserId] = useState<string>('');
  const [delegations, setDelegations] = useState<any[]>([]);
  const [grantee, setGrantee] = useState<string>('');
  const [roles, setRoles] = useState<string[]>(['responsable']);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [stepCode, setStepCode] = useState<string>('');
  const [stepToken, setStepToken] = useState<string>('');
  const [showStepModal, setShowStepModal] = useState<boolean>(false);

  useEffect(() => {
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
    (async () => {
      try {
        const meRes: any = await axios.get('/api/auth/me');
        setMe(meRes);
        const del: any = await axios.get('/api/admin/delegations');
        setDelegations(del as any);
      } catch (e:any) {}
    })();
  }, []);

  const openStepUp = () => { setShowStepModal(true); setStepCode(''); };
  const doStepUp = async () => {
    try {
      const res: any = await axios.post('/api/auth/step-up', { code: stepCode });
      setStepToken(res.step_up_token);
      setShowStepModal(false);
      setMessage('Verificación 2FA de alto riesgo validada');
    } catch (e:any) { setError(e?.message || 'No se pudo verificar'); }
  };

  const impersonate = async () => {
    try {
      setMessage(null); setError(null);
      if (!stepToken) { openStepUp(); return; }
      const res: any = await axios.post('/api/auth/impersonate/start', { target_user_id: targetUserId }, { headers: { 'X-Step-Up': stepToken } });
      // Sustituir authUser en sessionStorage para navegar como impersonado
      sessionStorage.setItem('authUser', JSON.stringify(res));
      window.location.href = '/dashboard-audit';
    } catch (e:any) { setError(e?.message || 'No se pudo impersonar'); }
  };

  const stopImpersonate = async () => {
    try {
      await axios.post('/api/auth/impersonate/stop');
      // auth middleware devolverá tokens del admin
      window.location.reload();
    } catch (e:any) { setError(e?.message || 'No se pudo terminar impersonación'); }
  };

  const createDelegation = async () => {
    try {
      setMessage(null); setError(null);
      if (!expiresAt) { setError('Indica fecha/hora de expiración'); return; }
      const payload = { grantee_user_id: grantee, roles: roles, expires_at: new Date(expiresAt).toISOString() };
      const res: any = await axios.post('/api/admin/delegations', payload);
      setMessage('Delegación creada');
      const del: any = await axios.get('/api/admin/delegations');
      setDelegations(del as any);
    } catch (e:any) { setError(e?.message || 'No se pudo crear la delegación'); }
  };

  const revokeDelegation = async (id: string) => {
    try { await axios.post(`/api/admin/delegations/${id}/revoke`); setDelegations((d) => d.map((x) => x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)); } catch {}
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row><Col lg={12}><h4 className="mb-3">Panel de Usuario</h4></Col></Row>
        {message && <Alert color="success" isOpen transition={{ timeout: 200 }}>{message}</Alert>}
        {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}

        <Row className="g-3">
          <Col md={6}>
            <Card><CardBody>
              <h6>Mis datos</h6>
              {me ? (
                <ul className="mb-0">
                  <li><strong>Email:</strong> {me.email}</li>
                  <li><strong>Rol:</strong> {me.role}</li>
                  <li><strong>Org:</strong> {me.org_id}</li>
                </ul>
              ) : <Spinner size="sm"/>}
            </CardBody></Card>

            <Card className="mt-3"><CardBody>
              <h6>Impersonar usuario</h6>
              <div className="mb-2"><Label>ID de usuario</Label><Input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="UUID del usuario" /></div>
              <Button color="warning" onClick={impersonate}>Impersonar (requiere 2FA)</Button>{' '}
              <Button color="secondary" onClick={stopImpersonate}>Terminar impersonación</Button>
            </CardBody></Card>
          </Col>

          <Col md={6}>
            <Card><CardBody>
              <h6>Delegar acceso temporal</h6>
              <div className="mb-2"><Label>Usuario destinatario (ID)</Label><Input value={grantee} onChange={(e) => setGrantee(e.target.value)} placeholder="UUID grantee" /></div>
              <div className="mb-2">
                <Label>Roles delegados</Label>
                <div className="d-flex gap-3">
                  {['admin','responsable','investigador','auditor'].map(r => (
                    <div className="form-check" key={r}>
                      <Input className="form-check-input" type="checkbox" id={`r-${r}`} checked={roles.includes(r)} onChange={(e) => {
                        if (e.target.checked) setRoles([...new Set([...roles, r])]); else setRoles(roles.filter(x => x!==r));
                      }} />
                      <Label className="form-check-label" htmlFor={`r-${r}`}>{r}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-2"><Label>Expira en</Label><Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
              <Button color="primary" onClick={createDelegation}>Crear delegación</Button>
            </CardBody></Card>

            <Card className="mt-3"><CardBody>
              <h6>Delegaciones en la organización</h6>
              <div className="table-responsive">
                <Table className="table align-middle table-striped">
                  <thead><tr><th>ID</th><th>Granter</th><th>Grantee</th><th>Roles</th><th>Expira</th><th>Revocada</th><th></th></tr></thead>
                  <tbody>
                    {delegations.map((d:any) => (
                      <tr key={d.id}>
                        <td className="text-truncate" style={{maxWidth:120}}>{d.id}</td>
                        <td className="text-truncate" style={{maxWidth:120}}>{d.granter_id}</td>
                        <td className="text-truncate" style={{maxWidth:120}}>{d.grantee_id}</td>
                        <td>{String(d.roles_csv)}</td>
                        <td>{new Date(d.expires_at).toLocaleString()}</td>
                        <td>{d.revoked_at ? new Date(d.revoked_at).toLocaleString() : '-'}</td>
                        <td>
                          {!d.revoked_at && <Button size="sm" color="danger" onClick={() => revokeDelegation(d.id)}>Revocar</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </CardBody></Card>
          </Col>
        </Row>

        <Modal isOpen={showStepModal} toggle={() => setShowStepModal(false)} centered>
          <ModalHeader toggle={() => setShowStepModal(false)}>Verificación 2FA requerida</ModalHeader>
          <ModalBody>
            <Label>Código 2FA</Label>
            <Input placeholder="123456" value={stepCode} onChange={(e) => setStepCode(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onClick={doStepUp}>Verificar</Button>
            <Button color="secondary" onClick={() => setShowStepModal(false)}>Cancelar</Button>
          </ModalFooter>
        </Modal>
      </Container>
    </div>
  );
};

export default UserPanel;

