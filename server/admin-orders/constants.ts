export const ADMIN_ORDERS_BASE_PATH = '/api/admin/orders'

export const isAdminOrdersPath = (requestPath: string) => {
  return requestPath === ADMIN_ORDERS_BASE_PATH
    || requestPath.startsWith(`${ADMIN_ORDERS_BASE_PATH}/`)
}
