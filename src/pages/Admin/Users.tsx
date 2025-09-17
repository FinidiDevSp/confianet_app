import React, { useEffect, useMemo, useState } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  CardHeader,
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

type SortField = 'created_at' | 'email' | 'name' | 'role' | 'status';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toOptionalString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

const parseMfaFlag = (value: unknown): string | boolean | undefined => {
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return undefined;
};

const normalizeUserRow = (candidate: unknown): UserRow | null => {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = toOptionalString(candidate.id);
  const email = toOptionalString(candidate.email);
  const role = toOptionalString(candidate.role);
  const status = toOptionalString(candidate.status ?? candidate.state);
  const createdAt = toOptionalString(candidate.created_at ?? candidate.createdAt);

  if (!id || !email || !role || !status || !createdAt) {
    return null;
  }

  const name = toOptionalString(candidate.name);
  const mfa = parseMfaFlag(candidate.mfa_enabled ?? candidate.mfaEnabled);

  const normalized: UserRow = {
    id,
    email,
    role,
    status,
    created_at: createdAt,
    name,
  };

  if (mfa !== undefined) {
    normalized.mfa_enabled = mfa;
  }

  return normalized;
};

const extractUserCollection = (payload: unknown): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isRecord(payload)) {
    const maybeCollection =
      payload.data ?? payload.items ?? payload.results ?? payload.users ?? null;

    if (Array.isArray(maybeCollection)) {
      return maybeCollection;
    }
  }

  return null;
};

const parseUsersResponse = (payload: unknown): UserRow[] | null => {
  const collection = extractUserCollection(payload);

  if (!collection) {
    return null;
  }

  const normalized = collection
    .map(normalizeUserRow)
    .filter((user): user is UserRow => user !== null);

  if (normalized.length === 0 && collection.length > 0) {
    return null;
  }

  return normalized;
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

  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<UserRow | null>(null);

  // Step-Up (2FA alto riesgo)
  const [stepCode, setStepCode] = useState<string>('');
  const [stepToken, setStepToken] = useState<string>('');
  const [showStepModal, setShowStepModal] = useState<boolean>(false);
  const [pendingEditBody, setPendingEditBody] = useState<Record<string, unknown> | null>(null);

  // Helpers: decodificar expiración de JWT (sin validar firma)
  const decodeJwtExp = (token: string): number | null => {
    try {
      const payload = token.split('.')[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const obj = JSON.parse(json) as { exp?: number };
      return typeof obj.exp === 'number' ? obj.exp : null;
    } catch {
      return null;
    }
  };
  const remainingSecondsFromToken = (token: string): number | null => {
    const exp = decodeJwtExp(token);
    if (!exp) return null;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, exp - now);
  };
  const fmtRemaining = (secs: number | null): string => {
    if (secs == null) return '~5min';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (m <= 0) return `~${s}s`;
    if (s === 0) return `~${m}min`;
    return `~${m}min ${s}s`;
  };

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
      const parsed = parseUsersResponse(res);

      if (parsed === null) {
        throw new Error('Respuesta de usuarios inválida');
      }

      setUsers(parsed);
    } catch (e: any) {
      setError(e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const searchFiltered = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter((u) =>
      [u.email, u.name ?? '', u.role, u.status]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [users, query]);

  const roleFiltered = useMemo(() => {
    if (roleFilters.length === 0) return searchFiltered;
    return searchFiltered.filter((u) => roleFilters.includes(u.role));
  }, [searchFiltered, roleFilters]);

  const statusFiltered = useMemo(() => {
    if (statusFilters.length === 0) return searchFiltered;
    return searchFiltered.filter((u) => statusFilters.includes(u.status));
  }, [searchFiltered, statusFilters]);

  const filtered = useMemo(
    () =>
      searchFiltered.filter((u) => {
        const matchRole = roleFilters.length === 0 || roleFilters.includes(u.role);
        const matchStatus = statusFilters.length === 0 || statusFilters.includes(u.status);
        return matchRole && matchStatus;
      }),
    [searchFiltered, roleFilters, statusFilters]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let result = 0;
      switch (sortField) {
        case 'email':
          result = a.email.localeCompare(b.email, 'es', { sensitivity: 'base' });
          break;
        case 'name':
          result = (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
          break;
        case 'role':
          result = a.role.localeCompare(b.role, 'es', { sensitivity: 'base' });
          break;
        case 'status':
          result = a.status.localeCompare(b.status, 'es', { sensitivity: 'base' });
          break;
        case 'created_at':
        default:
          result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === 'asc' ? result : -result;
    });
    return arr;
  }, [filtered, sortField, sortOrder]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const user of roleFiltered) {
      counts[user.status] = (counts[user.status] ?? 0) + 1;
    }
    return counts;
  }, [roleFiltered]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const user of statusFiltered) {
      counts[user.role] = (counts[user.role] ?? 0) + 1;
    }
    return counts;
  }, [statusFiltered]);

  const roleTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const user of users) {
      counts[user.role] = (counts[user.role] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }));
  }, [users]);

  const rolesAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const user of users) {
      set.add(user.role);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [users]);

  const statusesAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const user of users) {
      set.add(user.status);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [users]);
  const hasPrev = page > 1;
  const hasNext = users.length >= pageSize; // heurística simple

  const toggleRoleFilter = (value: string) => {
    setRoleFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleStatusFilter = (value: string) => {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const clearFilters = () => {
    setRoleFilters([]);
    setStatusFilters([]);
  };

  const exportCsv = () => {
    if (sorted.length === 0) {
      setError('No hay datos para exportar');
      return;
    }
    const headers = ['Email', 'Nombre', 'Rol', 'Estado', '2FA', 'Alta'];
    const rows = sorted.map((u) => [
      u.email,
      u.name ?? '',
      u.role,
      u.status,
      String(u.mfa_enabled === true || String(u.mfa_enabled) === '1' ? 'Sí' : 'No'),
      new Date(u.created_at).toISOString(),
    ]);
    const csvContent = [headers, ...rows]
      .map((cols) => cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `usuarios_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
      const left = remainingSecondsFromToken(stepToken);
      setMessage(`Usuario eliminado. Acción protegida por 2FA (${fmtRemaining(left)} restantes)`);
      await load();
    } catch (err: any) {
      const msg = (err?.message || err || 'No se pudo eliminar') as string;
      setError(msg as string);
      const lower = String(msg).toLowerCase();
      if (lower.includes('step-up') || lower.includes('step up')) {
        setShowStepModal(true);
      }
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
          const left = remainingSecondsFromToken(freshToken);
          setMessage(`Usuario eliminado. Acción protegida por 2FA (${fmtRemaining(left)} restantes)`);
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
        const left = remainingSecondsFromToken(freshToken);
        setMessage(`Usuario actualizado. Acción protegida por 2FA (${fmtRemaining(left)} restantes)`);
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

        <Row className="g-4">
          <Col xl={4} lg={6}>
            <Card className="h-100">
              <CardHeader className="d-flex align-items-center justify-content-between gap-2">
                <h5 className="card-title mb-0">
                  {editingUser ? 'Editar usuario' : 'Invitar usuario'}
                </h5>
                <span
                  className={`badge text-uppercase fs-11 ${editingUser ? 'bg-warning-subtle text-warning' : 'bg-primary-subtle text-primary'}`}
                >
                  {editingUser ? 'Modo edición' : 'Nueva invitación'}
                </span>
              </CardHeader>
              <CardBody>
                <Form onSubmit={submit}>
                  <div className="mb-3">
                    <Label className="form-label">Correo</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={!!editingUser}
                    />
                  </div>
                  <div className="mb-3">
                    <Label className="form-label">Nombre</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="mb-3">
                    <Label className="form-label">Rol</Label>
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
                    <div className="fs-12 text-muted mb-2">
                      La activación de 2FA la realiza cada usuario en su perfil (Seguridad → 2FA).
                    </div>
                  )}
                  <div className="d-flex flex-wrap gap-2">
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
              <CardHeader className="d-flex flex-wrap align-items-center gap-2">
                <div className="flex-grow-1">
                  <h5 className="card-title mb-1">Usuarios</h5>
                  <p className="text-muted mb-0">
                    Gestiona y monitorea las cuentas registradas.
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Button color="light" size="sm" onClick={exportCsv} className="btn-soft-secondary">
                    <FeatherIcon icon="download" className="icon-sm me-1" /> Exportar CSV
                  </Button>
                  {(roleFilters.length > 0 || statusFilters.length > 0) && (
                    <Button color="link" size="sm" onClick={clearFilters} className="text-decoration-none">
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardBody>
                {loading ? (
                  <div className="py-5 text-center">
                    <Spinner size="sm" className="me-2" />
                    Cargando usuarios...
                  </div>
                ) : (
                  <>
                    <Row className="g-3 mb-4">
                      <Col xxl={4} md={6}>
                        <div className="border border-dashed rounded-3 p-3 h-100">
                          <p className="text-muted text-uppercase fs-12 mb-2">
                            Total usuarios (página)
                          </p>
                          <h5 className="mb-1">{users.length}</h5>
                          <p className="text-muted mb-0">
                            Coincidencias visibles:{' '}
                            <span className="text-body fw-semibold">{sorted.length}</span>
                          </p>
                        </div>
                      </Col>
                      <Col xxl={8} md={6}>
                        <div className="border border-dashed rounded-3 p-3 h-100">
                          <p className="text-muted text-uppercase fs-12 mb-2">
                            Totales por rol (página)
                          </p>
                          <div className="hstack gap-2 flex-wrap">
                            {roleTotals.length > 0 ? (
                              roleTotals.map(([roleName, total]) => (
                                <span
                                  key={roleName}
                                  className="badge bg-primary-subtle text-primary fs-13 text-capitalize"
                                >
                                  {roleName}
                                  <span className="ms-1 fw-semibold">{total}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-muted fs-13">
                                Sin usuarios en la página actual
                              </span>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                    <Row className="g-3 align-items-center mb-4">
                      <Col lg={5}>
                        <div className="search-box">
                          <Input
                            type="search"
                            className="form-control"
                            placeholder="Buscar (email, nombre, rol)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                          <i className="ri-search-line search-icon" />
                        </div>
                      </Col>
                      <Col lg={7}>
                        <div className="d-flex flex-wrap gap-2 justify-content-lg-end">
                          <Input
                            type="select"
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as SortField)}
                            className="w-auto"
                          >
                            <option value="created_at">Ordenar por fecha de alta</option>
                            <option value="name">Ordenar por nombre</option>
                            <option value="email">Ordenar por email</option>
                            <option value="role">Ordenar por rol</option>
                            <option value="status">Ordenar por estado</option>
                          </Input>
                          <Button
                            color="secondary"
                            outline
                            size="sm"
                            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                            aria-label={`Cambiar orden (${sortOrder === 'asc' ? 'ascendente' : 'descendente'})`}
                          >
                            <FeatherIcon
                              icon={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                              className="icon-sm me-1"
                            />
                            {sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
                          </Button>
                        </div>
                      </Col>
                    </Row>
                    <Row className="g-4 mb-4">
                      <Col xxl={7}>
                        <div>
                          <p className="text-muted text-uppercase fs-12 mb-2">Filtrar por rol</p>
                          <div className="d-flex flex-wrap gap-2">
                            {rolesAvailable.map((roleName) => (
                              <Button
                                key={roleName}
                                color="primary"
                                outline={!roleFilters.includes(roleName)}
                                size="sm"
                                className="rounded-pill text-capitalize"
                                onClick={() => toggleRoleFilter(roleName)}
                              >
                                {roleName}
                                <Badge
                                  color={roleFilters.includes(roleName) ? 'light' : 'secondary'}
                                  pill
                                  className="ms-2"
                                >
                                  {roleCounts[roleName] ?? 0}
                                </Badge>
                              </Button>
                            ))}
                            {rolesAvailable.length === 0 && (
                              <span className="text-muted fs-13">Sin roles disponibles</span>
                            )}
                          </div>
                        </div>
                      </Col>
                      <Col xxl={5}>
                        <div>
                          <p className="text-muted text-uppercase fs-12 mb-2">Filtrar por estado</p>
                          <div className="d-flex flex-wrap gap-2">
                            {statusesAvailable.map((statusName) => (
                              <Button
                                key={statusName}
                                color="success"
                                outline={!statusFilters.includes(statusName)}
                                size="sm"
                                className="rounded-pill text-capitalize"
                                onClick={() => toggleStatusFilter(statusName)}
                              >
                                {statusName}
                                <Badge
                                  color={statusFilters.includes(statusName) ? 'light' : 'secondary'}
                                  pill
                                  className="ms-2"
                                >
                                  {statusCounts[statusName] ?? 0}
                                </Badge>
                              </Button>
                            ))}
                            {statusesAvailable.length === 0 && (
                              <span className="text-muted fs-13">Sin estados disponibles</span>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                    <div className="table-responsive table-card" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                      <Table className="table align-middle table-striped mb-0">
                        <thead className="table-light">
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
                          {sorted.map((u) => (
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
                          {sorted.length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center">
                                Sin usuarios
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mt-3">
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
                  </>
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

