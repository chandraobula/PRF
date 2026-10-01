import { apiRequest } from './http';

export const listNotifications = (limit = 40) => apiRequest(`/notifications?limit=${limit}`);
export const getNotificationUnreadCount = () => apiRequest('/notifications/unread-count');
export const getNotificationConfig = () => apiRequest('/notifications/config');
export const markNotification = (id, status = 'read') => apiRequest(`/notifications/${encodeURIComponent(id)}`, {
  method: 'PATCH', body: JSON.stringify({ status }),
});
export const markAllNotificationsRead = () => apiRequest('/notifications/read-all', { method: 'POST' });
export const savePushSubscription = (subscription) => apiRequest('/notifications/push-subscriptions', {
  method: 'POST', body: JSON.stringify(subscription),
});
export const removePushSubscription = (endpoint) => apiRequest('/notifications/push-subscriptions', {
  method: 'DELETE', body: JSON.stringify({ endpoint }),
});
