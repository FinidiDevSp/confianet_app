import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardBody, Col, Container, Row, Form, FormFeedback, Input, Button, Alert } from 'reactstrap';
import axios from 'axios';
import ParticlesAuth from "../ParticlesAuth";

//import images 
import logoLight from "../../../assets/images/logo-light.png";

//formik
import { useFormik } from 'formik';
import * as Yup from 'yup';

const BasicSignUp = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const params = useMemo(() => new URLSearchParams(search), [search]);
    const token = params.get('token') || '';
    const emailPrefill = params.get('email') || '';
    const namePrefill = params.get('name') || '';

    document.title = "Crear contraseña | Confianet";

    const [passwordShow, setPasswordShow] = useState<boolean>(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [canSubmit, setCanSubmit] = useState<boolean>(false);

    const validation: any = useFormik({
        // enableReinitialize : use this flag when initial values needs to be changed
        enableReinitialize: true,

        initialValues: {
            email: emailPrefill,
            userName: namePrefill,
            password: '',
            confirm: '',
        },
        validationSchema: Yup.object({
            email: Yup.string().required("Correo requerido").email("Formato de correo inválido"),
            userName: Yup.string().required("Nombre requerido"),
            password: Yup.string()
                .min(10, 'Mínimo 10 caracteres')
                .matches(RegExp('(.*[A-Z].*)'), 'Debe incluir mayúscula')
                .matches(RegExp('(.*[0-9].*)'), 'Debe incluir número')
                .matches(RegExp('(.*[^A-Za-z0-9].*)'), 'Debe incluir símbolo')
                .required("Contraseña requerida"),
            confirm: Yup.string().oneOf([Yup.ref('password') as any], 'Las contraseñas no coinciden').required('Confirma tu contraseña'),
        }),
        onSubmit: async (values) => {
            setError(null); setMessage(null);
            try {
                await axios.post('/api/users/accept-invitation', { token, password: values.password });
                setMessage('Contraseña creada con éxito. Ya puedes iniciar sesión.');
                setTimeout(() => navigate('/login'), 1500);
            } catch (e: any) {
                setError(e?.response?.data?.detail || e?.message || 'Error al crear contraseña');
            }
        }
    });

    return (
        <React.Fragment>
            <ParticlesAuth>
                <div className="auth-page-content mt-lg-5">

                    <Container>
                        <Row>
                            <Col lg={12}>
                                <div className="text-center mt-sm-5 mb-4 text-white-50">
                                    <div>
                                        <Link to="/" className="d-inline-block auth-logo">
                                            <img src={logoLight} alt="" height="20" />
                                        </Link>
                                    </div>
                                    <p className="mt-3 fs-15 fw-medium">Premium Admin & Dashboard Template</p>
                                </div>
                            </Col>
                        </Row>

                        <Row className="justify-content-center">
                            <Col md={8} lg={6} xl={5}>
                                <Card className="mt-4">

                                    <CardBody className="p-4">
                                        <div className="text-center mt-2">
                                            <h5 className="text-primary">Crear contraseña</h5>
                                            <p className="text-muted">Completa tu alta en Confianet</p>
                                        </div>
                                        {message && <Alert color="success" isOpen transition={{ timeout: 200 }}>{message}</Alert>}
                                        {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}
                                        <div className="p-2 mt-4">
                                        <Form onSubmit={(e) => {
                                                e.preventDefault();
                                                validation.handleSubmit();
                                                return false;
                                            }} className="needs-validation" action="#">

                                                <div className="mb-3">
                                                    <label htmlFor="useremail" className="form-label">Email <span className="text-danger">*</span></label>
                                                    <Input type="email" className="form-control" id="useremail" placeholder="Correo electrónico"
                                                        name="email"
                                                        value={validation.values.email}
                                                        onBlur={validation.handleBlur}
                                                        onChange={validation.handleChange}
                                                        disabled
                                                        invalid={validation.errors.email && validation.touched.email ? true : false}
                                                    />
                                                    {validation.errors.email && validation.touched.email ? (
                                                        <FormFeedback type="invalid">{validation.errors.email}</FormFeedback>
                                                    ) : null}
                                                </div>
                                                <div className="mb-3">
                                                    <label htmlFor="username" className="form-label">Nombre <span className="text-danger">*</span></label>
                                                    <Input type="text" className="form-control" id="username" placeholder="Nombre y apellidos"
                                                        name="userName"
                                                        disabled
                                                        onChange={validation.handleChange}
                                                        onBlur={validation.handleBlur}
                                                        value={validation.values.userName || ""}
                                                        invalid={
                                                            validation.touched.userName && validation.errors.userName ? true : false
                                                        }
                                                    />
                                                    {validation.touched.userName && validation.errors.userName ? (
                                                        <FormFeedback type="invalid">{validation.errors.userName}</FormFeedback>
                                                    ) : null}
                                                </div>

                                                <div className="mb-3">
                                                    <label className="form-label" htmlFor="password-input">Contraseña</label>
                                                    <div className="position-relative auth-pass-inputgroup">
                                                        <Input
                                                            type={passwordShow ? "text" : "password"}
                                                            className="form-control pe-5 password-input"
                                                            placeholder="Contraseña"
                                                            id="password-input"
                                                            name="password"
                                                            value={validation.values.password}
                                                            onBlur={validation.handleBlur}
                                                            onChange={validation.handleChange}
                                                            invalid={validation.errors.password && validation.touched.password ? true : false}
                                                        />
                                                        <Button color="link" onClick={() => setPasswordShow(!passwordShow)} className="position-absolute end-0 top-50 translate-middle-y text-decoration-none text-muted password-addon" type="button"
                                                            id="password-addon"><i className="ri-eye-fill align-middle"></i></Button>
                                                    </div>
                                                    {validation.errors.password && validation.touched.password ? (
                                                        <FormFeedback className="d-block" type="invalid">{validation.errors.password}</FormFeedback>
                                                    ) : null}
                                                </div>

                                                <div className="mb-3">
                                                    <label htmlFor="confirm" className="form-label">Confirmar contraseña</label>
                                                    <Input type="password" id="confirm" name="confirm" placeholder="Repite la contraseña"
                                                        value={validation.values.confirm}
                                                        onChange={validation.handleChange}
                                                        onBlur={validation.handleBlur}
                                                        invalid={validation.errors.confirm && validation.touched.confirm ? true : false}
                                                    />
                                                    {validation.errors.confirm && validation.touched.confirm ? (
                                                        <FormFeedback type="invalid">{validation.errors.confirm}</FormFeedback>
                                                    ) : null}
                                                </div>

                                                <div id="password-contain" className="p-3 bg-light mb-2 rounded">
                                                    <h5 className="fs-13">Password must contain:</h5>
                                                    <p id="pass-length" className="invalid fs-12 mb-2">Minimum <b>8 characters</b></p>
                                                    <p id="pass-lower" className="invalid fs-12 mb-2">At <b>lowercase</b> letter (a-z)</p>
                                                    <p id="pass-upper" className="invalid fs-12 mb-2">At least <b>uppercase</b> letter (A-Z)</p>
                                                    <p id="pass-number" className="invalid fs-12 mb-0">A least <b>number</b> (0-9)</p>
                                                </div>

                                                <div className="mt-4">
                                                    <button className="btn btn-success w-100" type="submit">Crear contraseña</button>
                                                </div>

                                                {/* Social login removed */}
                                            </Form>
                                        </div>
                                    </CardBody>
                                </Card>

                                {/* Already have an account link removed */}

                            </Col>
                        </Row>
                    </Container>
                </div>
            </ParticlesAuth>
        </React.Fragment>
    );
};

export default BasicSignUp;
