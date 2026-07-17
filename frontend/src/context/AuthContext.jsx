import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (authToken) {
      setUser({ token: authToken });
    } else {
      setUser(null);
    }
  }, [authToken]);

  const login = (token) => {
    localStorage.setItem('authToken', token);
    setAuthToken(token);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setUser(null);
  };

  const signup = (token) => {
    login(token);
  };

  return (
    <AuthContext.Provider value={{ authToken, user, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
};
