import Capacitor
import LocalAuthentication

@objc(FitBiometricPlugin)
public class FitBiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FitBiometricPlugin"
    public let jsName = "FitBiometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private func reason(_ error: Error?) -> String {
        guard let code = (error as? LAError)?.code else { return "temporarily_unavailable" }
        switch code {
        case .biometryNotEnrolled:
            return "not_enrolled"
        case .biometryNotAvailable:
            return "unsupported"
        case .biometryLockout:
            return "lockout"
        case .userCancel, .appCancel, .systemCancel:
            return "cancelled"
        default:
            return "temporarily_unavailable"
        }
    }

    @objc public func status(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve([
            "available": available,
            "reason": available ? "" : reason(error)
        ])
    }

    @objc public func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedCancelTitle = call.getString("cancelText") ?? "Cancel"
        context.localizedFallbackTitle = ""

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            call.resolve(["ok": false, "error": reason(error)])
            return
        }

        let prompt = call.getString("reason") ?? "Unlock Fit Timer"
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: prompt) { [weak self] ok, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                call.resolve([
                    "ok": ok,
                    "error": ok ? "" : self.reason(error)
                ])
            }
        }
    }
}
