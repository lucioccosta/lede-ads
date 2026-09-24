-- IP externo (WAN) observado pela API no heartbeat
ALTER TABLE "Device" ADD COLUMN "externalIp" TEXT;
