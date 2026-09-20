window.__ModuleLoader__.load({
	id: "dsh-token-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const createElement = react.createElement;

		const DASHBOARD_URL = "http://127.0.0.1:8788/";

		function Dashboard() {
			return createElement("iframe", {
				title: "TokenDashboard",
				src: DASHBOARD_URL,
				style: {
					width: "100%",
					height: "calc(100vh - 118px)",
					minHeight: "640px",
					border: "0",
					display: "block",
					background: "transparent"
				}
			});
		}

		function ChartGlyph(props) {
			const size = Number(props && props.size) > 0 ? Number(props.size) : 18;
			return createElement(
				"svg",
				{ width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", focusable: "false" },
				createElement("rect", { x: 1.5, y: 8.5, width: 3, height: 6, rx: 0.8 }),
				createElement("rect", { x: 6.5, y: 4.5, width: 3, height: 10, rx: 0.8 }),
				createElement("rect", { x: 11.5, y: 1.5, width: 3, height: 13, rx: 0.8 })
			);
		}

		// Icon-only: the stock sidebar row renders the registered label "Token 用量"
		// next to this glyph, so rendering the label here would show it twice.
		function SidebarEntry(props) {
			return createElement(ChartGlyph, { size: props && props.size });
		}

		function apply(ctx) {
			const slots = ctx.slots || ctx.get("slots");
			if (!slots) return;
			slots.inject("sidebar.panellist", function () {
				try {
					const unregister = slots.register({ name: "sidebar.panellist", id: "token-dashboard", order: 50, label: "Token 用量" }, SidebarEntry);
					return function () { unregister(); };
				} catch (err) {
					return function () {};
				}
			});
			slots.inject("main", function () {
				try {
					const unregister = slots.register({ name: "main", key: "token-dashboard" }, Dashboard);
					return function () { unregister(); };
				} catch (err) {
					return function () {};
				}
			});
		}

		const inject = ["slots"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
