import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Container, Form, Input, Label, Nav, NavItem, NavLink, Row, Spinner, TabContent, TabPane } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

type PasswordPolicy = { min_length: number; require_upper: boolean; require_number: boolean; require_symbol: boolean };
type EmailSettings = { smtp_host: string; smtp_port: number; username?: string | null; has_password?: boolean; use_tls: boolean; use_ssl: boolean; from_name: string; from_email: string };

const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'policy' | 'email'>('policy');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [policy, setPolicy] = useState<PasswordPolicy>({ min_length: 12, require_upper: true, require_number: true, require_symbol: true });
  const [emailCfg, setEmailCfg] = useState<EmailSettings>({ smtp_host: '', smtp_port: 587, username: '', has_password: false, use_tls: true, use_ssl: false, from_name: 'Confianet', from_email: '' });
  const [emailPassword, setEmailPassword] = useState<string>('');

  useEffect(() => {
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
    (async () => {
      try {
        setLoading(true);
        const pol = await axios.get<PasswordPolicy>('/api/users/password-policy');
        setPolicy(pol as unknown as PasswordPolicy);
        const mail = await axios.get<EmailSettings>('/api/settings/email');
        setEmailCfg(mail as unknown as EmailSettings);
      } catch (e: any) {
        setError(e?.message || 'Error cargando configuración');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  const savePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null); setError(null);
    try {
      const res = await axios.patch('/api/users/password-policy', policy);
      setPolicy(res as any);
      setMessage('Política de contraseñas actualizada');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la política');
    }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null); setError(null);
    try {
      const payload: any = { ...emailCfg };
      payload.password = emailPassword === '' ? null : emailPassword; // null => mantener, string => actualizar
      const res = await axios.patch('/api/settings/email', payload);
      setEmailCfg(res as any);
      setEmailPassword('');
      setMessage('Configuración de correo guardada');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el correo');
    }
  };

  // Sólo admin: check rápido por rol
  let role: string | undefined;
  try { const u = JSON.parse(sessionStorage.getItem('authUser') || 'null'); role = u && (u.user?.role || u.role); } catch {}
  if (role !== 'admin') {
    return (
      <div className="page-content"><Container fluid><Alert color="warning" className="mt-3">No autorizado</Alert></Container></div>
    );
  }

  return (
    <div className="page-content">
      <Container fluid>
        <Row><Col lg={12}><h4 className="mb-3">Configuraciones</h4></Col></Row>
        {message && <Alert color="success" isOpen transition={{ timeout: 200 }}>{message}</Alert>}
        {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}
        {loading ? <Spinner size="sm" /> : (
          <>
            <Nav pills className="nav-pills nav-justified mb-3">
              <NavItem>
                <NavLink className={activeTab === 'policy' ? 'active' : ''} onClick={() => setActiveTab('policy')}>Política de contraseñas</NavLink>
              </NavItem>
              <NavItem>
                <NavLink className={activeTab === 'email' ? 'active' : ''} onClick={() => setActiveTab('email')}>Correo (SMTP)</NavLink>
              </NavItem>
            </Nav>
            <TabContent activeTab={activeTab}>
              <TabPane tabId="policy">
                <Card><CardBody>
                  <Form onSubmit={savePolicy}>
                    <Row className="g-3">
                      <Col md={3}><Label>Mínimo caracteres</Label><Input type="number" min={6} value={policy.min_length} onChange={e => setPolicy({ ...policy, min_length: parseInt(e.target.value || '0', 10) })} /></Col>
                      <Col md={2}><div className="form-check mt-4"><Input className="form-check-input" type="checkbox" checked={policy.require_upper} onChange={e => setPolicy({ ...policy, require_upper: e.target.checked })} id="pol-u" /><Label className="form-check-label" htmlFor="pol-u">Mayúscula</Label></div></Col>
                      <Col md={2}><div className="form-check mt-4"><Input className="form-check-input" type="checkbox" checked={policy.require_number} onChange={e => setPolicy({ ...policy, require_number: e.target.checked })} id="pol-n" /><Label className="form-check-label" htmlFor="pol-n">Número</Label></div></Col>
                      <Col md={2}><div className="form-check mt-4"><Input className="form-check-input" type="checkbox" checked={policy.require_symbol} onChange={e => setPolicy({ ...policy, require_symbol: e.target.checked })} id="pol-s" /><Label className="form-check-label" htmlFor="pol-s">Símbolo</Label></div></Col>
                      <Col md={3} className="mt-4"><Button color="primary" type="submit">Guardar</Button></Col>
                    </Row>
                  </Form>
                </CardBody></Card>
              </TabPane>
              <TabPane tabId="email">
                <Card><CardBody>
                  <Form onSubmit={saveEmail}>
                    <Row className="g-3">
                      <Col md={4}><Label>Servidor SMTP</Label><Input value={emailCfg.smtp_host} onChange={e => setEmailCfg({ ...emailCfg, smtp_host: e.target.value })} required /></Col>
                      <Col md={2}><Label>Puerto</Label><Input type="number" value={emailCfg.smtp_port} onChange={e => setEmailCfg({ ...emailCfg, smtp_port: parseInt(e.target.value || '0', 10) })} required /></Col>
                      <Col md={3}><Label>Usuario</Label><Input value={emailCfg.username || ''} onChange={e => setEmailCfg({ ...emailCfg, username: e.target.value })} /></Col>
                      <Col md={3}><Label>Contraseña</Label><Input type="password" placeholder={emailCfg.has_password ? '••••••' : ''} value={emailPassword} onChange={e => setEmailPassword(e.target.value)} /></Col>
                      <Col md={3}><Label>Remitente (nombre)</Label><Input value={emailCfg.from_name} onChange={e => setEmailCfg({ ...emailCfg, from_name: e.target.value })} required /></Col>
                      <Col md={4}><Label>Remitente (email)</Label><Input type="email" value={emailCfg.from_email} onChange={e => setEmailCfg({ ...emailCfg, from_email: e.target.value })} required /></Col>
                      <Col md={2}><div className="form-check mt-4"><Input className="form-check-input" type="checkbox" checked={emailCfg.use_tls} onChange={e => setEmailCfg({ ...emailCfg, use_tls: e.target.checked })} id="tls" /><Label className="form-check-label" htmlFor="tls">TLS</Label></div></Col>
                      <Col md={2}><div className="form-check mt-4"><Input className="form-check-input" type="checkbox" checked={emailCfg.use_ssl} onChange={e => setEmailCfg({ ...emailCfg, use_ssl: e.target.checked })} id="ssl" /><Label className="form-check-label" htmlFor="ssl">SSL</Label></div></Col>
                      <Col md={3} className="mt-4"><Button color="primary" type="submit">Guardar correo</Button></Col>
                    </Row>
                  </Form>
                </CardBody></Card>
              </TabPane>
            </TabContent>
          </>
        )}
      </Container>
    </div>
  );
};

export default AdminSettings;
