import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, CardBody, Form, Label, Input, Button, Table, Alert, Spinner, Badge } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

type UserRow = { id: string; email: string; name: string | null; role: string; status: string; created_at: string };

const UsersAdmin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('investigador');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
    load();
  }, [page, pageSize]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get<UserRow[]>(`/api/users`, {
        params: { limit: pageSize, offset: (page - 1) * pageSize },
      });
      setUsers(res as unknown as UserRow[]);
    } catch (e: any) {
      setError(e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(u => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (u.email?.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || u.status.toLowerCase().includes(q));
  });
  const totalOnPage = filtered.length;
  const hasPrev = page > 1;
  const hasNext = users.length >= pageSize; // server page size heuristic

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

  const onEdit = async (u: UserRow) => {
    const newName = window.prompt('Nuevo nombre para el usuario:', u.name || '') ?? undefined;
    if (newName === undefined) return;
    const newRole = window.prompt('Nuevo rol (admin, responsable, investigador, auditor):', u.role) ?? undefined;
    if (newRole === undefined) return;
    try {
      await axios.patch(`/api/users/${u.id}`, { name: newName, role: newRole });
      setMessage('Usuario actualizado');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar usuario');
    }
  };

  const onDeleteOrSuspend = async (u: UserRow) => {
    const choice = window.confirm('¿Quieres eliminar al usuario? Si cancelas, se suspenderá.');
    try {
      if (choice) {
        await axios.delete(`/api/users/${u.id}`);
        setMessage('Usuario eliminado');
      } else {
        await axios.post(`/api/users/${u.id}/suspend`);
        setMessage('Usuario suspendido');
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Operación no completada');
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
      const res: any = await axios.post(`/api/users/invitations`, { email, name, role });
      setMessage(`Invitación enviada. URL (dev): ${res.invitation_url}`);
      setEmail(''); setName(''); setRole('investigador');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Error al invitar');
    }
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}><h4 className="mb-3">Administración de Usuarios</h4></Col>
        </Row>
        {message && <Alert color="success" isOpen transition={{ timeout: 200 }}>{message}</Alert>}
        {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}
        <Row>
          <Col xl={4} lg={6}>
            <Card>
              <CardBody>
                <h6>Invitar usuario</h6>
                <Form onSubmit={submit}>
                  <div className="mb-3">
                    <Label>Correo</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
                  <Button color="primary" type="submit">Enviar invitación</Button>
                </Form>
              </CardBody>
            </Card>
          </Col>
          <Col xl={8} lg={12}>
            <Card>
              <CardBody>
                <h6>Usuarios</h6>
                {loading ? <Spinner size="sm" /> : (
                  <div className="table-responsive">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted small">Pagina {page}</span>
                        <select className="form-select form-select-sm" style={{ width: 90 }} value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value || '10', 10)); }}>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Input placeholder="Buscar (email, nombre, rol)" value={query} onChange={(e) => setQuery(e.target.value)} />
                        <button className="btn btn-sm btn-secondary" disabled={!hasPrev || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>&laquo; Anterior</button>
                        <button className="btn btn-sm btn-secondary" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>Siguiente &raquo;</button>
                      </div>
                    </div>
                    <Table className="table align-middle table-striped">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Nombre</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>Alta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(u => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>{u.name || '-'}</td>
                            <td>{u.role}</td>
                            <td><Badge color={badgeColor(u.status)}>{u.status}</Badge></td>
                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="text-nowrap">
                              <Button size="sm" color="light" onClick={() => onEdit(u)}>Editar</Button>{' '}
                              <Button size="sm" color="danger" onClick={() => onDeleteOrSuspend(u)}>Eliminar/Suspender</Button>{' '}
                              {u.status === 'pending' && (
                                <Button size="sm" color="info" onClick={() => onResendInvitation(u)}>Reenviar invitacion</Button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={6} className="text-center">Sin usuarios</td></tr>}
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
  );
};

export default UsersAdmin;
