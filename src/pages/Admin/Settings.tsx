import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Col, Container, Form, FormGroup, FormText, Input, Label, ListGroup, ListGroupItem, Nav, NavItem, NavLink, Row, Spinner, TabContent, TabPane } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

type PasswordPolicy = { min_length: number; require_upper: boolean; require_number: boolean; require_symbol: boolean };
type EmailSettings = { smtp_host: string; smtp_port: number; username?: string | null; has_password?: boolean; use_tls: boolean; use_ssl: boolean; from_name: string; from_email: string };

type EmailTemplate = {
  id: string;
  name: string;
  description?: string | null;
  subject_template: string;
  body_html: string;
  allowed_variables: string[];
  sample_context: Record<string, unknown>;
  updated_at?: string | null;
};

type EmailTemplatesResponse = {
  templates: EmailTemplate[];
};

type EmailTestLog = { level: string; message: string; timestamp: string };

type EmailTestResult = { success: boolean; idempotent: boolean; detail?: string | null };

type EmailTestResponse = EmailTestResult & { logs: EmailTestLog[] };

const DEFAULT_TEMPLATE_ID = 'user_invitation';


const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'policy' | 'email'>('policy');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [policy, setPolicy] = useState<PasswordPolicy>({ min_length: 12, require_upper: true, require_number: true, require_symbol: true });
  const [emailCfg, setEmailCfg] = useState<EmailSettings>({ smtp_host: '', smtp_port: 587, username: '', has_password: false, use_tls: true, use_ssl: false, from_name: 'Confianet', from_email: '' });
  const [emailPassword, setEmailPassword] = useState<string>('');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [templateSubject, setTemplateSubject] = useState<string>('');
  const [templateBody, setTemplateBody] = useState<string>('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState<string>('');
  const [testSending, setTestSending] = useState(false);
  const [testLogs, setTestLogs] = useState<EmailTestLog[]>([]);
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);

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
        setTestEmail((mail as unknown as EmailSettings).from_email || '');
        const tpl = await axios.get<EmailTemplatesResponse>('/api/settings/email/templates');
        const templatesData = tpl as unknown as EmailTemplatesResponse;
        setTemplates(templatesData.templates);
        if (templatesData.templates.length > 0) {
          const template = templatesData.templates.find(t => t.id === DEFAULT_TEMPLATE_ID) || templatesData.templates[0];
          setSelectedTemplateId(template.id);
          setTemplateSubject(template.subject_template);
          setTemplateBody(template.body_html);
        } else {
          setSelectedTemplateId(DEFAULT_TEMPLATE_ID);
          setTemplateSubject('');
          setTemplateBody('');
        }
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

  const activeTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setTemplateSubject(tpl.subject_template);
      setTemplateBody(tpl.body_html);
    } else {
      setTemplateSubject('');
      setTemplateBody('');
    }
    setPreviewHtml('');
  };

  const handleTemplateSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTemplateId) {
      return;
    }
    setTemplateSaving(true);
    setMessage(null); setError(null);
    try {
      const updated = await axios.put<EmailTemplate>(`/api/settings/email/templates/${selectedTemplateId}`, {
        subject_template: templateSubject,
        body_html: templateBody,
      });
      const tpl = updated as unknown as EmailTemplate;
      setTemplates(prev => prev.map(item => (item.id === tpl.id ? tpl : item)));
      setTemplateSubject(tpl.subject_template);
      setTemplateBody(tpl.body_html);
      setMessage('Plantilla actualizada');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la plantilla');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handlePreviewTemplate = async () => {
    if (!selectedTemplateId) {
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const preview = await axios.post<{ subject: string; html: string }>(`/api/settings/email/templates/${selectedTemplateId}/preview`, { variables: {} });
      const data = preview as unknown as { subject: string; html: string };
      setPreviewHtml(`<h4 style="margin-top:0">${data.subject}</h4>${data.html}`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar la vista previa');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      setError('Ingresa un correo de destino para la prueba');
      return;
    }
    setTestSending(true);
    setTestLogs([]);
    setTestResult(null);
    setMessage(null); setError(null);
    try {
      const response = await axios.post<EmailTestResponse>('/api/settings/email/test', {
        to_email: testEmail,
        template_id: selectedTemplateId,
      });
      const data = response as unknown as EmailTestResponse;
      setTestLogs(data.logs || []);
      setTestResult({ success: data.success, idempotent: data.idempotent, detail: data.detail });
      if (data.success) {
        setMessage('Correo de prueba enviado');
      } else if (data.detail) {
        setError(data.detail);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el correo de prueba');
    } finally {
      setTestSending(false);
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
                <Card>
                  <CardBody>
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
                        <Col md={3} className="mt-4 d-flex align-items-end"><Button color="primary" type="submit">Guardar correo</Button></Col>
                      </Row>
                    </Form>
                    <hr className="my-4" />
                    <h6 className="mb-3">Enviar email de prueba</h6>
                    <Row className="g-3 align-items-end">
                      <Col md={4}><Label>Destinatario</Label><Input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="admin@tu-dominio.com" required /></Col>
                      <Col md={4}>
                        <Label>Plantilla</Label>
                        <Input type="select" value={selectedTemplateId} onChange={e => handleTemplateSelect(e.target.value)}>
                          {templates.length === 0 && <option value={DEFAULT_TEMPLATE_ID}>{DEFAULT_TEMPLATE_ID}</option>}
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Input>
                      </Col>
                      <Col md={3} className="mt-3 mt-md-0">
                        <Button color="secondary" type="button" onClick={handleSendTestEmail} disabled={testSending}>
                          {testSending ? 'Enviando…' : 'Enviar email de prueba'}
                        </Button>
                      </Col>
                    </Row>
                    {testResult && (
                      <Alert color={testResult.success ? 'success' : 'warning'} className="mt-3">
                        {testResult.success ? 'Correo de prueba enviado correctamente.' : testResult.detail || 'No se pudo enviar el correo.'}
                        {testResult.idempotent && <div className="mt-1">Se utilizó el resultado más reciente (idempotente).</div>}
                      </Alert>
                    )}
                    {testLogs.length > 0 && (
                      <ListGroup className="mt-3">
                        {testLogs.map((log, idx) => (
                          <ListGroupItem key={`${log.timestamp}-${idx}`}>
                            <Badge color={log.level === 'error' ? 'danger' : 'secondary'} className="me-2 text-uppercase">{log.level}</Badge>
                            <small className="text-muted me-2">{new Date(log.timestamp).toLocaleString()}</small>
                            {log.message}
                          </ListGroupItem>
                        ))}
                      </ListGroup>
                    )}
                  </CardBody>
                </Card>
                <Card className="mt-4">
                  <CardHeader><h5 className="mb-0">Gestor de plantillas</h5></CardHeader>
                  <CardBody>
                    {templates.length === 0 ? (
                      <p className="text-muted mb-0">No hay plantillas configuradas.</p>
                    ) : (
                      <>
                        <Row className="g-3">
                          <Col md={4}>
                            <FormGroup>
                              <Label>Selecciona plantilla</Label>
                              <Input type="select" value={selectedTemplateId} onChange={e => handleTemplateSelect(e.target.value)}>
                                {templates.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </Input>
                            </FormGroup>
                          </Col>
                          <Col md={8} className="d-flex flex-column justify-content-center">
                            <p className="mb-1 text-muted">{activeTemplate?.description}</p>
                            {activeTemplate?.updated_at && (
                              <small className="text-muted">Última actualización: {new Date(activeTemplate.updated_at).toLocaleString()}</small>
                            )}
                          </Col>
                        </Row>
                        <Form onSubmit={handleTemplateSave}>
                          <Row className="g-3">
                            <Col md={6}>
                              <FormGroup>
                                <Label>Asunto (Jinja)</Label>
                                <Input type="textarea" rows={2} value={templateSubject} onChange={e => setTemplateSubject(e.target.value)} required />
                              </FormGroup>
                            </Col>
                            <Col md={6}>
                              <FormGroup>
                                <Label>Contenido HTML (Jinja)</Label>
                                <Input type="textarea" rows={8} value={templateBody} onChange={e => setTemplateBody(e.target.value)} required />
                                <FormText className="text-muted">Variables disponibles: {(activeTemplate?.allowed_variables || []).join(', ')}</FormText>
                              </FormGroup>
                            </Col>
                          </Row>
                          <div className="d-flex gap-2 mt-3">
                            <Button color="primary" type="submit" disabled={templateSaving}>{templateSaving ? 'Guardando…' : 'Guardar plantilla'}</Button>
                            <Button color="secondary" type="button" onClick={handlePreviewTemplate} disabled={previewLoading}>
                              {previewLoading ? 'Generando…' : 'Vista previa'}
                            </Button>
                          </div>
                        </Form>
                        {previewHtml && (
                          <Card className="mt-3">
                            <CardHeader><h6 className="mb-0">Vista previa renderizada</h6></CardHeader>
                            <CardBody>
                              <div className="email-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            </CardBody>
                          </Card>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
              </TabPane>
            </TabContent>
          </>
        )}
      </Container>
    </div>
  );
};

export default AdminSettings;
