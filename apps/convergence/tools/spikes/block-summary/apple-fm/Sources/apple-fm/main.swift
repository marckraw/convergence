import Foundation
import FoundationModels

@Generable
struct Summary {
    var sentence: String
}

struct Request: Decodable {
    let id: String
    let prompt: String
}

struct Reply: Encodable {
    let id: String
    let sentence: String?
    let generationMs: Double
    let error: String?
}

@main
struct AppleFM {
    static func main() async {
        // Explicitly select the on-device model, without a cloud fallback.
        let model = SystemLanguageModel.default
        while let line = readLine() {
            let start = ContinuousClock.now
            var id = "invalid-request"
            do {
                let request = try JSONDecoder().decode(Request.self, from: Data(line.utf8))
                id = request.id
                guard case .available = model.availability else {
                    emit(Reply(id: id, sentence: nil, generationMs: elapsed(start),
                               error: String(describing: model.availability)))
                    continue
                }
                // New session per block prevents cross-block evidence leakage.
                let session = LanguageModelSession(model: model)
                let response = try await session.respond(
                    to: request.prompt, generating: Summary.self,
                    options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 96)
                )
                emit(Reply(id: id, sentence: response.content.sentence,
                           generationMs: elapsed(start), error: nil))
            } catch {
                emit(Reply(id: id, sentence: nil, generationMs: elapsed(start),
                           error: String(reflecting: error)))
            }
        }
    }

    static func elapsed(_ start: ContinuousClock.Instant) -> Double {
        let duration = start.duration(to: .now).components
        return Double(duration.seconds) * 1000 + Double(duration.attoseconds) / 1e15
    }

    static func emit(_ reply: Reply) {
        let data = try! JSONEncoder().encode(reply)
        FileHandle.standardOutput.write(data + Data([10]))
    }
}
