@echo off
chcp 65001 >nul
title Sistema Distribuido de Libreria Comercial - Microservicios
echo ============================================================================
echo   INICIANDO SISTEMA DISTRIBUIDO DE LIBRERIA COMERCIAL (MICROSERVICIOS)
echo   - Portal Web Interactivo:  http://localhost:3000
echo   - catalog-service:         http://localhost:3001
echo   - inventory-service:       http://localhost:3002
echo   - orders-service:          http://localhost:3003
echo   - auth-service (JWT/RBAC): http://localhost:3004
echo ============================================================================
start "" "http://localhost:3000"
node "%~dp0iniciar-sistema.js"
pause
