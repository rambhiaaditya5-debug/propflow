import ReactDOM from "react-dom/client";
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  IndianRupee,
  PackagePlus,
  Pencil,
  Store,
  UserPlus,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { db } from "./firebase";
import "./propflow.css";

const ORDER_STATUS = {
  IN_QUEUE: "in_queue",
  PAYMENT_LEFT: "payment_left",
  PAID: "paid",
};

const PAYMENT_METHODS = ["Cash", "UPI", "Bank"];

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function calculatePending(order) {
  if (typeof order.pendingAmount === "number") return order.pendingAmount;
  return Math.max(Number(order.amount || 0) - Number(order.receivedAmount || 0), 0);
}

function saveWithTimeout(savePromise) {
  return Promise.race([
    savePromise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Saving took too long. Please check Firebase rules and internet.")),
        12000
      );
    }),
  ]);
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isVendorOpen, setIsVendorOpen] = useState(false);
  const [isSavingVendor, setIsSavingVendor] = useState(false);
  const [formError, setFormError] = useState("");
  const [vendorError, setVendorError] = useState("");
  const [form, setForm] = useState({
    description: "",
    companyName: "",
    shootLocation: "",
    vendorId: "",
    receivingDate: todayInputValue(),
    givingDate: todayInputValue(),
    amount: "",
    staff: "Amit",
  });
  const [vendorForm, setVendorForm] = useState({
    fullName: "",
    mobileNumber: "",
  });

  const [paymentLeftVendorFilter, setPaymentLeftVendorFilter] = useState("");
  const [paidVendorFilter, setPaidVendorFilter] = useState("");

  useEffect(() => {
    const ordersQuery = query(
      collection(db, "orders"),
      orderBy("givingDate", "asc")
    );
    return onSnapshot(ordersQuery, (snapshot) => {
      setOrders(
        snapshot.docs.map((orderDoc) => ({
          id: orderDoc.id,
          ...orderDoc.data(),
        }))
      );
    });
  }, []);

  useEffect(() => {
    const vendorsQuery = query(
      collection(db, "vendors"),
      orderBy("fullName", "asc")
    );
    return onSnapshot(vendorsQuery, (snapshot) => {
      setVendors(
        snapshot.docs.map((vendorDoc) => ({
          id: vendorDoc.id,
          ...vendorDoc.data(),
        }))
      );
    });
  }, []);

  const inQueueOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.IN_QUEUE),
    [orders]
  );

  const paymentLeftOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.PAYMENT_LEFT),
    [orders]
  );

  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === ORDER_STATUS.PAID),
    [orders]
  );

  const paymentLeftVendors = useMemo(() => {
    const seen = new Set();
    return paymentLeftOrders
      .filter((o) => {
        if (!o.vendorName || seen.has(o.vendorName)) return false;
        seen.add(o.vendorName);
        return true;
      })
      .map((o) => ({ id: o.vendorId, name: o.vendorName }));
  }, [paymentLeftOrders]);

  const paidVendors = useMemo(() => {
    const seen = new Set();
    return paidOrders
      .filter((o) => {
        if (!o.vendorName || seen.has(o.vendorName)) return false;
        seen.add(o.vendorName);
        return true;
      })
      .map((o) => ({ id: o.vendorId, name: o.vendorName }));
  }, [paidOrders]);

  const filteredPaymentLeftOrders = useMemo(
    () =>
      paymentLeftVendorFilter
        ? paymentLeftOrders.filter((o) => o.vendorName === paymentLeftVendorFilter)
        : paymentLeftOrders,
    [paymentLeftOrders, paymentLeftVendorFilter]
  );

  const filteredPaidOrders = useMemo(
    () =>
      paidVendorFilter
        ? paidOrders.filter((o) => o.vendorName === paidVendorFilter)
        : paidOrders,
    [paidOrders, paidVendorFilter]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const description = form.description.trim();
    const companyName = form.companyName.trim();
    const shootLocation = form.shootLocation.trim();
    const amount = Number(form.amount);
    const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId);

    if (
      !description ||
      !companyName ||
      !shootLocation ||
      !selectedVendor ||
      !form.receivingDate ||
      !form.givingDate ||
      !form.staff ||
      !Number.isFinite(amount)
    ) {
      setFormError(
        "Please fill all order details, select a vendor, and enter the order amount."
      );
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await saveWithTimeout(
        addDoc(collection(db, "orders"), {
          description,
          companyName,
          shootLocation,
          vendorId: selectedVendor.id,
          vendorName: selectedVendor.fullName,
          vendorMobile: selectedVendor.mobileNumber,
          receivingDate: form.receivingDate,
          givingDate: form.givingDate,
          amount,
          receivedAmount: 0,
          pendingAmount: amount,
          staff: form.staff,
          status: ORDER_STATUS.IN_QUEUE,
          paymentMethod: "",
          createdAt: serverTimestamp(),
          givenAt: null,
          paidAt: null,
        })
      );

      setForm({
        description: "",
        companyName: "",
        shootLocation: "",
        vendorId: form.vendorId,
        receivingDate: todayInputValue(),
        givingDate: todayInputValue(),
        amount: "",
        staff: form.staff,
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Order could not be saved. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVendorSubmit(event) {
    event.preventDefault();
    const fullName = vendorForm.fullName.trim();
    const mobileNumber = vendorForm.mobileNumber.trim();
    if (!fullName || !mobileNumber) return;

    setIsSavingVendor(true);
    setVendorError("");
    try {
      await saveWithTimeout(
        addDoc(collection(db, "vendors"), {
          fullName,
          mobileNumber,
          createdAt: serverTimestamp(),
        })
      );
      setVendorForm({ fullName: "", mobileNumber: "" });
    } catch (error) {
      setVendorError(
        error instanceof Error
          ? error.message
          : "Vendor could not be saved. Please try again."
      );
    } finally {
      setIsSavingVendor(false);
    }
  }

  async function markGiven(orderId) {
    await updateDoc(doc(db, "orders", orderId), {
      status: ORDER_STATUS.PAYMENT_LEFT,
      givenAt: serverTimestamp(),
    });
  }

  async function updateOrderAmount(orderId, newAmount) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const receivedAmount = Number(order.receivedAmount || 0);
    const pendingAmount = Math.max(newAmount - receivedAmount, 0);
    await updateDoc(doc(db, "orders", orderId), {
      amount: newAmount,
      pendingAmount,
    });
  }

  async function setPaymentMethod(orderId, paymentMethod) {
    await updateDoc(doc(db, "orders", orderId), { paymentMethod });
  }

  async function markPaid(orderId, paymentMethod) {
    const selectedOrder = orders.find((order) => order.id === orderId);
    const amount = Number(selectedOrder?.amount || 0);
    await updateDoc(doc(db, "orders", orderId), {
      status: ORDER_STATUS.PAID,
      paymentMethod: paymentMethod || "Cash",
      receivedAmount: amount,
      pendingAmount: 0,
      paidAt: serverTimestamp(),
    });
  }

  const showSingleColumn = activeTab !== "all";

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Internal prop shop queue</p>
          <h1>PropFlow</h1>
        </div>
        <div className="top-actions">
          <button
            className="vendor-button"
            type="button"
            onClick={() => setIsVendorOpen(!isVendorOpen)}
          >
            <UserPlus size={18} />
            Add Vendor
          </button>
          <div className="status-pill">
            <span>{inQueueOrders.length}</span> in queue
          </div>
        </div>
      </section>

      {isVendorOpen && (
        <form className="vendor-panel" onSubmit={handleVendorSubmit}>
          <div className="section-title">
            <Store size={20} />
            <h2>Add Vendor</h2>
          </div>
          <label>
            Full name
            <input
              value={vendorForm.fullName}
              onChange={(e) =>
                setVendorForm({ ...vendorForm, fullName: e.target.value })
              }
              placeholder="Example: Ramesh Sharma"
              required
            />
          </label>
          <label>
            Mobile number
            <input
              value={vendorForm.mobileNumber}
              onChange={(e) =>
                setVendorForm({ ...vendorForm, mobileNumber: e.target.value })
              }
              placeholder="Example: 9876543210"
              required
            />
          </label>
          <button className="primary-button" disabled={isSavingVendor}>
            {isSavingVendor ? "Saving..." : "Save Vendor"}
          </button>
          {vendorError && <p className="form-error">{vendorError}</p>}
        </form>
      )}

      <section className="workspace">
        <form className="order-form" onSubmit={handleSubmit}>
          <div className="section-title">
            <PackagePlus size={20} />
            <h2>New Order</h2>
          </div>

          <label>
            Prop description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Example: 4 brass lamps for studio shoot"
              rows={4}
              required
            />
          </label>

          <label>
            Company name
            <input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="Example: Red Studio"
              required
            />
          </label>

          <label>
            Shoot location
            <input
              value={form.shootLocation}
              onChange={(e) =>
                setForm({ ...form, shootLocation: e.target.value })
              }
              placeholder="Example: Film City, Goregaon"
              required
            />
          </label>

          <label>
            Vendor
            <select
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
              required
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.fullName} - {vendor.mobileNumber}
                </option>
              ))}
            </select>
          </label>

          <label>
            Receiving date
            <input
              type="date"
              value={form.receivingDate}
              onChange={(e) =>
                setForm({ ...form, receivingDate: e.target.value })
              }
              required
            />
          </label>

          <label>
            Giving date
            <input
              type="date"
              value={form.givingDate}
              onChange={(e) => setForm({ ...form, givingDate: e.target.value })}
              required
            />
          </label>

          <label>
            Total order amount
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Example: 2500"
              required
            />
          </label>

          <fieldset>
            <legend>Responsible staff</legend>
            <div className="staff-options">
              {["Amit", "Nilesh"].map((staffName) => (
                <label className="radio-card" key={staffName}>
                  <input
                    type="radio"
                    name="staff"
                    value={staffName}
                    checked={form.staff === staffName}
                    onChange={(e) =>
                      setForm({ ...form, staff: e.target.value })
                    }
                  />
                  <UserRound size={18} />
                  {staffName}
                </label>
              ))}
            </div>
          </fieldset>

          <button className="primary-button" disabled={isSaving}>
            {isSaving ? "Adding..." : "Add to Queue"}
          </button>
          {formError && <p className="form-error">{formError}</p>}
        </form>

        <section className="queue-area">
          <div className="tabs" aria-label="Queue views">
            <button
              className={activeTab === "all" ? "active" : ""}
              onClick={() => setActiveTab("all")}
              type="button"
            >
              Split View
            </button>
            <button
              className={activeTab === ORDER_STATUS.IN_QUEUE ? "active" : ""}
              onClick={() => setActiveTab(ORDER_STATUS.IN_QUEUE)}
              type="button"
            >
              In Queue
            </button>
            <button
              className={activeTab === ORDER_STATUS.PAYMENT_LEFT ? "active" : ""}
              onClick={() => setActiveTab(ORDER_STATUS.PAYMENT_LEFT)}
              type="button"
            >
              Payment Left
            </button>
            <button
              className={activeTab === ORDER_STATUS.PAID ? "active" : ""}
              onClick={() => setActiveTab(ORDER_STATUS.PAID)}
              type="button"
            >
              Paid
            </button>
          </div>

          <div className={showSingleColumn ? "queues single" : "queues"}>
            {(activeTab === "all" || activeTab === ORDER_STATUS.IN_QUEUE) && (
              <QueueColumn
                title="In Queue"
                count={inQueueOrders.length}
                emptyText="No active orders yet."
                orders={inQueueOrders}
                actionLabel="Given"
                actionIcon={<CheckCircle2 size={18} />}
                onAction={markGiven}
                onUpdateAmount={updateOrderAmount}
                compactPaymentDetails
              />
            )}

            {(activeTab === "all" || activeTab === ORDER_STATUS.PAYMENT_LEFT) && (
              <QueueColumn
                title="Payment Left"
                count={paymentLeftOrders.length}
                filteredCount={filteredPaymentLeftOrders.length}
                emptyText="No pending settlements."
                orders={filteredPaymentLeftOrders}
                isPaymentQueue
                onPaymentMethod={setPaymentMethod}
                onPaid={markPaid}
                vendorFilter={paymentLeftVendorFilter}
                onVendorFilterChange={setPaymentLeftVendorFilter}
                vendorOptions={paymentLeftVendors}
              />
            )}

            {activeTab === ORDER_STATUS.PAID && (
              <QueueColumn
                title="Paid"
                count={paidOrders.length}
                filteredCount={filteredPaidOrders.length}
                emptyText="No paid orders yet."
                orders={filteredPaidOrders}
                isPaidQueue
                vendorFilter={paidVendorFilter}
                onVendorFilterChange={setPaidVendorFilter}
                vendorOptions={paidVendors}
              />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function QueueColumn({
  title,
  count,
  filteredCount,
  emptyText,
  orders,
  actionLabel,
  actionIcon,
  onAction,
  onUpdateAmount,
  isPaymentQueue,
  isPaidQueue,
  onPaymentMethod,
  onPaid,
  compactPaymentDetails,
  vendorFilter,
  onVendorFilterChange,
  vendorOptions,
}) {
  const displayCount =
    vendorFilter && filteredCount !== undefined ? filteredCount : count;

  return (
    <section className="queue-column">
      <div className="column-header">
        <h2>{title}</h2>
        <span>{displayCount}</span>
      </div>

      {onVendorFilterChange && (
        <div className="column-filter">
          <select
            value={vendorFilter}
            onChange={(e) => onVendorFilterChange(e.target.value)}
          >
            <option value="">All Vendors</option>
            {(vendorOptions || []).map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="cards">
        {orders.length === 0 && (
          <p className="empty-state">{emptyText}</p>
        )}

        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            actionLabel={actionLabel}
            actionIcon={actionIcon}
            onAction={onAction}
            onUpdateAmount={onUpdateAmount}
            isPaymentQueue={isPaymentQueue}
            isPaidQueue={isPaidQueue}
            onPaymentMethod={onPaymentMethod}
            onPaid={onPaid}
            compactPaymentDetails={compactPaymentDetails}
          />
        ))}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  actionLabel,
  actionIcon,
  onAction,
  onUpdateAmount,
  isPaymentQueue,
  isPaidQueue,
  onPaymentMethod,
  onPaid,
  compactPaymentDetails,
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");

  function startEdit() {
    setAmountDraft(String(order.amount || ""));
    setEditingAmount(true);
  }

  function cancelEdit() {
    setEditingAmount(false);
    setAmountDraft("");
  }

  async function saveAmount() {
    const parsed = Number(amountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (onUpdateAmount) await onUpdateAmount(order.id, parsed);
    setEditingAmount(false);
  }

  return (
    <article className="order-card">
      <div className="date-row">
        <span>
          <CalendarDays size={16} />
          Give: {formatDate(order.givingDate)}
        </span>
        <strong>{order.staff}</strong>
      </div>

      <p>{order.description}</p>

      <div className="detail-grid">
        <span>Vendor: {order.vendorName || "Not selected"}</span>
        <span>Mobile: {order.vendorMobile || "-"}</span>
        <span>Company: {order.companyName || "-"}</span>
        <span>Location: {order.shootLocation || "-"}</span>
        <span>Receiving: {formatDate(order.receivingDate)}</span>

        {onUpdateAmount ? (
          <div className="amount-cell" style={{ gridColumn: "span 1" }}>
            {editingAmount ? (
              <div className="amount-edit-row">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveAmount();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                />
                <button className="amount-save-btn" onClick={saveAmount}>
                  Save
                </button>
                <button className="amount-cancel-btn" onClick={cancelEdit}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <span>Amount: {formatMoney(order.amount)}</span>
                <button
                  className="amount-edit-btn"
                  onClick={startEdit}
                  title="Edit amount"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
        ) : (
          <span>Amount: {formatMoney(order.amount)}</span>
        )}
      </div>

      {!compactPaymentDetails && (
        <div className="vendor-payment">
          <div>
            <strong>{order.vendorName || "Vendor"}</strong>
            <small>
              Got {formatMoney(order.receivedAmount)} / Left{" "}
              {formatMoney(calculatePending(order))}
            </small>
          </div>
          <span>Total {formatMoney(order.amount)}</span>
        </div>
      )}

      {isPaymentQueue ? (
        <div className="payment-panel">
          <div className="payment-note">
            <IndianRupee size={16} />
            Payment left
          </div>

          <div className="payment-methods" aria-label="Payment method">
            {PAYMENT_METHODS.map((method) => (
              <button
                className={order.paymentMethod === method ? "selected" : ""}
                key={method}
                type="button"
                onClick={() => onPaymentMethod && onPaymentMethod(order.id, method)}
              >
                {method}
              </button>
            ))}
          </div>

          <button
            className="paid-button"
            type="button"
            onClick={() => onPaid && onPaid(order.id, order.paymentMethod)}
          >
            <WalletCards size={18} />
            Mark Paid
          </button>
        </div>
      ) : isPaidQueue ? (
        <div className="payment-note paid-note">
          <CheckCircle2 size={16} />
          Paid by {order.paymentMethod || "Cash"}
        </div>
      ) : (
        <button
          className="given-button"
          type="button"
          onClick={() => onAction && onAction(order.id)}
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
    </article>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
