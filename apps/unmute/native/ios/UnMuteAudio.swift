import Foundation
import Capacitor
import Speech
import AVFoundation

@objc(UnMuteBridgeViewController)
public final class UnMuteBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(UnMuteAudioPlugin())
    }
}

@objc(UnMuteAudioPlugin)
public final class UnMuteAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UnMuteAudioPlugin"
    public let jsName = "UnMuteAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestMicrophone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listVoices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecognition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecognition", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognitionLive = false

    @objc func requestMicrophone(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var micGranted = false
        var speechGranted = false

        group.enter()
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            micGranted = granted
            group.leave()
        }

        group.enter()
        SFSpeechRecognizer.requestAuthorization { status in
            speechGranted = status == .authorized
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve(["granted": micGranted && speechGranted])
        }
    }

    @objc func listVoices(_ call: CAPPluginCall) {
        let voices = AVSpeechSynthesisVoice.speechVoices().map { voice in
            [
                "name": voice.name,
                "language": voice.language,
                "network": false
            ] as [String : Any]
        }
        call.resolve(["voices": voices])
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = (call.getString("text") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            call.resolve(["spoken": false])
            return
        }

        DispatchQueue.main.async {
            let locale = call.getString("locale") ?? "en-US"
            let requestedVoice = call.getString("voice") ?? ""
            let utterance = AVSpeechUtterance(string: text)

            if !requestedVoice.isEmpty,
               let voice = AVSpeechSynthesisVoice.speechVoices().first(where: { $0.name == requestedVoice }) {
                utterance.voice = voice
            } else {
                utterance.voice = AVSpeechSynthesisVoice(language: locale)
            }

            self.synthesizer.stopSpeaking(at: .immediate)
            self.synthesizer.speak(utterance)
            call.resolve(["spoken": true])
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
            call.resolve()
        }
    }

    @objc func startRecognition(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.resolve(["started": false])
            notifyListeners("speechError", data: ["error": "permission"])
            return
        }

        DispatchQueue.main.async {
            self.stopRecognitionInternal(emitStatus: false)

            let language = call.getString("language") ?? "en-US"
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)),
                  recognizer.isAvailable else {
                call.resolve(["started": false])
                self.notifyListeners("speechError", data: ["error": "recognition"])
                return
            }

            let engine = AVAudioEngine()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = false

            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
                try session.setActive(true, options: .notifyOthersOnDeactivation)

                let node = engine.inputNode
                let format = node.outputFormat(forBus: 0)
                node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                    request.append(buffer)
                }

                self.audioEngine = engine
                self.recognitionRequest = request
                self.recognitionLive = true

                self.recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                    if let result, result.isFinal {
                        let values = result.transcriptions
                            .map { $0.formattedString.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty }
                        let unique = Array(NSOrderedSet(array: values)) as? [String] ?? values
                        let alternatives = Array(unique.prefix(3))
                        if let first = alternatives.first {
                            self.notifyListeners("speechResult", data: [
                                "text": first,
                                "alternatives": alternatives
                            ])
                        } else {
                            self.notifyListeners("speechError", data: ["error": "no-speech"])
                        }
                        self.stopRecognitionInternal(emitStatus: true)
                        return
                    }

                    if let error {
                        self.notifyListeners("speechError", data: ["error": self.mapRecognitionError(error)])
                        self.stopRecognitionInternal(emitStatus: true)
                    }
                }

                engine.prepare()
                try engine.start()
                self.notifyListeners("speechStatus", data: ["status": "listening"])
                call.resolve(["started": true, "language": language])
            } catch {
                self.stopRecognitionInternal(emitStatus: false)
                call.resolve(["started": false])
                self.notifyListeners("speechError", data: ["error": "recognition"])
            }
        }
    }

    @objc func stopRecognition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopRecognitionInternal(emitStatus: true)
            call.resolve()
        }
    }

    private func mapRecognitionError(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            return "network"
        }
        if SFSpeechRecognizer.authorizationStatus() != .authorized {
            return "permission"
        }
        if ns.code == 203 || ns.code == 1110 {
            return "no-speech"
        }
        if ns.code == 216 {
            return "aborted"
        }
        return "recognition"
    }

    private func stopRecognitionInternal(emitStatus: Bool) {
        recognitionLive = false
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil

        if let engine = audioEngine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if emitStatus {
            notifyListeners("speechStatus", data: ["status": "end"])
        }
    }

    public override func load() {
        super.load()
    }

    deinit {
        stopRecognitionInternal(emitStatus: false)
        synthesizer.stopSpeaking(at: .immediate)
    }
}
