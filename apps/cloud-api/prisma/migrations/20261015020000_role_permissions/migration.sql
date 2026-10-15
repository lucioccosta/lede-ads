-- Permissões configuráveis por perfil (sem linha = padrões do código)
CREATE TABLE "RolePermission" (
    "role" "UserRole" NOT NULL,
    "permissions" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role")
);
