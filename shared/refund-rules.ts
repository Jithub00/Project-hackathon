/**
 * Which refund requests a customer can make at each stage of a project. The server enforces these lists, and the client
 * uses the same lists so it only offers a reason the server will accept.
 */

/** Quality and delivery requests are for delivered work, up to the point the balance is paid. */
export const QUALITY_REQUEST_STATUSES: string[] = ['delivered', 'revision_requested', 'completed'];

/** Not-delivered requests can be made once the booking is confirmed, and at any later point before the balance is paid. */
export const NOT_DELIVERED_REQUEST_STATUSES: string[] = ['booked', 'delivered', 'revision_requested', 'completed'];
