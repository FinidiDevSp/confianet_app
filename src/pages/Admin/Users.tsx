import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, CardBody, Form, Label, Input, Button, Table, Alert, Spinner } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

type UserRow = { id: string; email: string; name: string | null; role: string; status: string; created_at: string };

const UsersAdmin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('investigador');
  const [users, setUsers] = useState<UserRow[]>([]);
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
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get<UserRow[]>(`/api/users`);
      setUsers(res as unknown as UserRow[]);
    } catch (e: any) {
      setError(e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
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
                    <Table className="table align-middle">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Nombre</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>Alta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>{u.name || '-'}</td>
                            <td>{u.role}</td>
                            <td>{u.status}</td>
                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={5} className="text-center">Sin usuarios</td></tr>}
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

