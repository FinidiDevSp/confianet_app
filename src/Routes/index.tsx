import React from 'react';
import { Routes, Route, Navigate } from "react-router-dom";

//Layouts
import NonAuthLayout from "../Layouts/NonAuthLayout";
import VerticalLayout from "../Layouts/index";

//routes
import { authProtectedRoutes, publicRoutes } from "./allRoutes";
import  AuthProtected  from './AuthProtected';
import { useProfile } from "../Components/Hooks/UserHooks";

const Index = () => {
    const { token } = useProfile();
    const defaultTarget = token ? "/dashboard-audit" : "/login";
    return (
        <React.Fragment>
            <Routes>
                {publicRoutes.map((route: { path: string | undefined; component: any; }, idx: React.Key | null | undefined) => (
                    <Route
                        path={route.path}
                        element={
                            <NonAuthLayout>
                                {route.component}
                            </NonAuthLayout>
                        }
                        key={idx}
                    />
                ))}

                {authProtectedRoutes.map((route: { path: string; component: any }, idx: React.Key | null | undefined) => (
                    <Route
                        path={route.path}
                        element={
                            <AuthProtected>
                                <VerticalLayout>{route.component}</VerticalLayout>
                            </AuthProtected>
                        }
                        key={idx}
                    />
                ))}

                {/* Default route: redirect to login if not authenticated */}
                <Route path="/" element={<Navigate to={defaultTarget} replace />} />
                {/* Fallback: any unknown route goes to the default as well */}
                <Route path="*" element={<Navigate to={defaultTarget} replace />} />
            </Routes>
        </React.Fragment>
    );
};

export default Index;
