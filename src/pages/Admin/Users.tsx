import React, { useEffect, useState } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  Form,
  Label,
  Input,
  Button,
  Table,
  Alert,
  Spinner,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from 'reactstrap';
import FeatherIcon from 'feather-icons-react';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  mfa_enabled?: string | boolean;
  created_at: string;
};

const UsersAdmin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('investigador');
  const [mfa, setMfa] = useState<boolean>(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<UserRow | null>(null);

  // Step-Up (2FA alto riesgo)
  const [stepCode, setStepCode] = useState<string>('');
  const [stepToken, setStepToken] = useState<string>('');
  const [showStepModal, setShowStepModal] = useState<boolean>(false);
  const [pendingEditBody, setPendingEditBody] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get<UserRow[]>(`/api/users`, {
        params: { limit: pageSize, offset: (page - 1) * pageSize },
      });
      // axios devuelve { data }, pero respetamos el patrón existente
      setUsers((res as unknown as { data: UserRow[] }).data ?? (res as unknown as UserRow[]));
    } catch (e: any) {
      setError(e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter((u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.status.toLowerCase().includes(q)
    );
  });
  const hasPrev = page > 1;
  const hasNext = users.length >= pageSize; // heurística simple

  const badgeColor = (status: string): string => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending':
        return 'secondary';
      case 'suspended':
        return 'warning';
      default:
        return 'light';
    }
  };

  const startEdit = (u: UserRow) => {
    setEditingUser(u);
    setEmail(u.email);
    setName(u.name || '');
    setRole(u.role);
  };

  // Auto-dimiss alerts
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const openConfirm = (u: UserRow) => {
    setTargetUser(u);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    setConfirmOpen(false);
    setTargetUser(null);
  };

  const confirmSuspend = async () => {
    if (!targetUser) return;
    try {
      await axios.post(`/api/users/${targetUser.id}/suspend`);
      setMessage('Usuario suspendido');
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo suspender');
    } finally {
      closeConfirm();
    }
  };

  const confirmDelete = async () => {
    if (!targetUser) return;
    try {
      if (!stepToken) {
        setShowStepModal(true);
        return;
      }
      await axios.delete(`/api/users/${targetUser.id}`, { headers: { 'X-Step-Up': stepToken } });
      setMessage('Usuario eliminado');
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar');
    } finally {
      closeConfirm();
    }
  };

  const verifyStepUp = async () => {
    try {
      const res: any = await axios.post('/api/auth/step-up', { code: stepCode });
      const freshToken: string = res.step_up_token;
      setStepToken(freshToken);
      setShowStepModal(false);
      // Ejecutar la acción pendiente de forma inmediata usando el token fresco
      if (targetUser) {
        try {
          await axios.delete(`/api/users/${targetUser.id}`, { headers: { 'X-Step-Up': freshToken } });
          setMessage('Usuario eliminado');
          await load();
        } catch (err: any) {
          setError(err?.message || 'No se pudo eliminar');
        } finally {
          setConfirmOpen(false);
          setTargetUser(null);
        }
      } else if (editingUser && pendingEditBody) {
        const headers = { 'X-Step-Up': freshToken };
        await axios.patch(`/api/users/${editingUser.id}`, pendingEditBody, { headers });
        setMessage('Usuario actualizado');
        setEditingUser(null);
        setPendingEditBody(null);
        await load();
      }
    } catch (err: any) {
      setError(err?.message || 'Código 2FA inválido');
    }
  };

  const confirmActivate = async () => {
    if (!targetUser) return;
    try {
      await axios.patch(`/api/users/${targetUser.id}`, { status: 'active' });
      setMessage('Usuario activado');
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo activar');
    } finally {
      closeConfirm();
    }
  };

  const onResendInvitation = async (u: UserRow) => {
    try {
      const res: any = await axios.post(`/api/users/${u.id}/resend-invitation`);
      if (res.reused) {
        setMessage(`La invitación sigue vigente. Expira: ${res.expires_at}`);
      } else {
        setMessage(`Nueva invitación generada. URL (dev): ${res.invitation_url}`);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo reenviar la invitación');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      if (editingUser) {
        // Enviar solo campos modificados
        const body: Record<string, unknown> = {};
        if (name !== editingUser.name) body.name = name;
        if (role !== editingUser.role) body.role = role;
        if (Object.keys(body).length === 0) {
          setMessage('Sin cambios');
        } else {
          const requiresStep = Object.prototype.hasOwnProperty.call(body, 'role');
          if (requiresStep && !stepToken) {
            setPendingEditBody(body);
            setShowStepModal(true);
            return;
          }
          const headers = requiresStep ? { 'X-Step-Up': stepToken } : undefined;
          await axios.patch(`/api/users/${editingUser.id}`, body, headers ? { headers } : undefined);
          setMessage('Usuario actualizado');
          setEditingUser(null);
        }
      } else {
        const res: any = await axios.post(`/api/users/invitations`, { email, name, role, mfa });
        if (res && res.message) {
          setMessage(res.message);
        } else {
          setMessage(`Invitación enviada a ${email}`);
        }
      }
      setEmail('');
      setName('');
      setRole('investigador');
      setMfa(false);
      await load();
    } catch (err: any) {
      setError(err?.message || (editingUser ? 'Error al actualizar' : 'Error al invitar'));
    }
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}>
            <h4 className="mb-3">Administración de Usuarios</h4>
          </Col>
        </Row>
        {message && (
          <Alert color="success" isOpen transition={{ timeout: 200 }}>
            {message}
          </Alert>
        )}
        {error && (
          <Alert color="danger" isOpen transition={{ timeout: 200 }}>
            {error}
          </Alert>
        )}

        <Row>
          <Col xl={4} lg={6}>
            <Card>
              <CardBody>
                <h6>{editingUser ? 'Editar usuario' : 'Invitar usuario'}</h6>
                <Form onSubmit={submit}>
                  <div className="mb-3">
                    <Label>Correo</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={!!editingUser}
                    />
                  </div>
                  <div className="mb-3">
                    <Label>Nombre</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="mb-3">
                    <Label>Rol</Label>
                    <Input type="select" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="investigador">investigador</option>
                      <option value="responsable">responsable</option>
                      <option value="auditor">auditor</option>
                      <option value="admin">admin</option>
                    </Input>
                  </div>
                  {!editingUser && (
                    <div className="form-check mb-3">
                      <Input
                        className="form-check-input"
                        id="invite-mfa"
                        type="checkbox"
                        checked={mfa}
                        onChange={(e) => setMfa(e.target.checked)}
                      />
                      <Label className="form-check-label" htmlFor="invite-mfa">
                        2FA activado (en nuevo usuario)
                      </Label>
                    </div>
                  )}
                  {editingUser && (
                    <div className="mb-2 text-muted" style={{ fontSize: 12 }}>
                      La activación de 2FA la realiza cada usuario en su perfil (Seguridad → 2FA).
                    </div>
                  )}
                  <div className="d-flex gap-2">
                    <Button color="primary" type="submit">
                      {editingUser ? 'EDITAR' : 'Enviar invitación'}
                    </Button>
                    {editingUser && (
                      <Button
                        color="secondary"
                        type="button"
                        onClick={() => {
                          setEditingUser(null);
                          setEmail('');
                          setName('');
                          setRole('investigador');
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </Form>
              </CardBody>
            </Card>
          </Col>

          <Col xl={8} lg={12}>
            <Card>
              <CardBody>
                <h6>Usuarios</h6>
                {loading ? (
                  <Spinner size="sm" />
                ) : (
                  <div className="table-responsive">
                    <div className="d-flex justify-content-end align-items-center mb-2">
                      <Input
                        placeholder="Buscar (email, nombre, rol)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ maxWidth: 340 }}
                      />
                    </div>
                    <Table className="table align-middle table-striped">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Nombre</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>2FA</th>
                          <th>Alta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((u) => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>{u.name || '-'}</td>
                            <td>{u.role}</td>
                            <td>
                              <Badge color={badgeColor(u.status)}>{u.status}</Badge>
                            </td>
                            <td>
                              {String(u.mfa_enabled) === '1' || u.mfa_enabled === true ? 'Sí' : 'No'}
                            </td>
                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="text-nowrap">
                              <Button
                                size="sm"
                                color="light"
                                aria-label="Editar"
                                title="Editar"
                                onClick={() => startEdit(u)}
                              >
                                <FeatherIcon icon="edit-2" className="icon-sm" />
                              </Button>{' '}
                              {u.status === 'suspended' ? (
                                <Button
                                  size="sm"
                                  color="success"
                                  aria-label="Activar"
                                  title="Activar"
                                  onClick={() => openConfirm(u)}
                                >
                                  <FeatherIcon icon="user-check" className="icon-sm" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  color="warning"
                                  aria-label="Suspender o eliminar"
                                  title="Suspender o eliminar"
                                  onClick={() => openConfirm(u)}
                                >
                                  <FeatherIcon icon="user-x" className="icon-sm" />
                                </Button>
                              )}{' '}
                              {u.status === 'pending' && (
                                <Button
                                  size="sm"
                                  color="info"
                                  aria-label="Reenviar invitación"
                                  title="Reenviar invitación"
                                  onClick={() => onResendInvitation(u)}
                                >
                                  <FeatherIcon icon="send" className="icon-sm" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center">
                              Sin usuarios
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                    <div className="d-flex justify-content-between align-items-center mt-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted small">Página {page}</span>
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
                      <div className="d-flex align-items-center gap-2">
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
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>

        {/* Modal de confirmación de acción (Suspender/Activar/Eliminar) */}
        <Modal isOpen={confirmOpen} toggle={closeConfirm} centered className="modal-dialog-centered">
          <ModalHeader toggle={closeConfirm}>Confirmar acción</ModalHeader>
          <ModalBody>
            {targetUser ? (
              <>
                <p>Selecciona la acción para el usuario:</p>
                <p className="mb-0">
                  <strong>{targetUser.email}</strong> {targetUser.name ? `(${targetUser.name})` : ''}
                </p>
                <div className="text-muted small mt-2">Acción protegida por 2FA (válido ~5min)</div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            {targetUser?.status === 'suspended' ? (
              <Button color="success" onClick={confirmActivate}>
                <FeatherIcon icon="user-check" className="icon-sm me-1" /> Activar
              </Button>
            ) : (
              <Button color="warning" onClick={confirmSuspend}>
                <FeatherIcon icon="pause-circle" className="icon-sm me-1" /> Suspender
              </Button>
            )}
            <Button color="danger" onClick={confirmDelete}>
              <FeatherIcon icon="trash-2" className="icon-sm me-1" /> Eliminar
            </Button>
            <Button color="secondary" onClick={closeConfirm}>
              Cancelar
            </Button>
          </ModalFooter>
        </Modal>

        {/* Modal Step-Up 2FA */}
        <Modal isOpen={showStepModal} toggle={() => setShowStepModal(false)} centered>
          <ModalHeader toggle={() => setShowStepModal(false)}>Verificación 2FA requerida</ModalHeader>
          <ModalBody>
            <Label>Código 2FA</Label>
            <Input placeholder="123456" value={stepCode} onChange={(e) => setStepCode(e.target.value)} />
            <div className="text-muted small mt-2">Acción protegida por 2FA (válido ~5min)</div>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onClick={verifyStepUp}>
              Verificar
            </Button>
            <Button color="secondary" onClick={() => setShowStepModal(false)}>
              Cancelar
            </Button>
          </ModalFooter>
        </Modal>
      </Container>
    </div>
  );
};

export default UsersAdmin;
