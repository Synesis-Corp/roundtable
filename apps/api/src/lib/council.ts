export type CouncilTier = 'strong' | 'light';

export interface CouncilCandidateModel {
  modelId: string;
  provider: string;
  displayName?: string;
  contextWindow?: number;
  reasoning?: boolean;
  toolCall?: boolean;
  structuredOutput?: boolean;
  attachment?: boolean;
}

export interface ParsedVote {
  vote: string;
  reason: string;
  improvement: string;
  confidence?: 'high' | 'medium' | 'low';
  risk?: string;
}

export interface CouncilAngle {
  id: string;
  label: string;
  description: string;
}

export const COUNCIL_ANGLES: CouncilAngle[] = [
  {
    id: 'pragmatic',
    label: 'Pragmático',
    description:
      'Prioriza simplicidad, velocidad de implementación y menor fricción. Favorece soluciones que se puedan desplegar rápido con recursos disponibles.',
  },
  {
    id: 'robust',
    label: 'Robusto',
    description:
      'Prioriza escalabilidad, mantenibilidad, edge cases y calidad a largo plazo. Acepta más complejidad si reduce riesgos técnicos futuros.',
  },
  {
    id: 'economic',
    label: 'Económico',
    description:
      'Prioriza costo, recursos y eficiencia. Minimiza infraestructura, llamadas externas y horas de desarrollo sin sacrificar lo esencial.',
  },
  {
    id: 'innovative',
    label: 'Innovador',
    description:
      'Prioriza soluciones creativas o no convencionales. Cuestiona supuestos y explora enfoques que otros podrían descartar.',
  },
  {
    id: 'secure',
    label: 'Seguro',
    description:
      'Prioriza seguridad, privacidad y cumplimiento. Identifica vectores de riesgo, datos sensibles y requisitos regulatorios.',
  },
  {
    id: 'user-centric',
    label: 'Centrado en el usuario',
    description:
      'Prioriza UX, facilidad de uso y accesibilidad. Evalúa la solución desde la perspectiva de quien la usará.',
  },
];

export interface ParsedProposalSource {
  title: string;
  url: string;
  snippet: string;
}

import { z } from 'zod';
import {
  defaultTierFor,
  isCouncilEligible,
  type CouncilTier as MatrixCouncilTier,
} from '@chat/router';

/**
 * Schema for a council member's vote, consumed via the provider's native
 * structured-output mode (`chatStructured`). Replaces the brittle
 * `VOTO:/RAZÓN:/MEJORA:` regex in {@link parseVote} (kept as a fallback).
 */
export const VoteSchema = z.object({
  vote: z.string().describe('El modelId exacto de la propuesta por la que votás'),
  reason: z.string().describe('Por qué esa propuesta es la mejor'),
  improvement: z.string().describe('Una mejora concreta para la propuesta elegida'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .describe('Nivel de confianza en el voto: high, medium o low'),
  risk: z.string().optional().describe('Principal riesgo o tradeoff de la propuesta elegida'),
});
export type CouncilVoteObject = z.infer<typeof VoteSchema>;

function toCouncilTier(tier: MatrixCouncilTier): CouncilTier {
  return tier === 'none' ? 'light' : tier;
}

function scoreCandidate(
  model: CouncilCandidateModel,
  options?: { boostToolCall?: boolean }
): number {
  let score = 0;
  if (model.reasoning) score += 90;
  if (model.toolCall) score += options?.boostToolCall ? 100 : 20;
  if (model.structuredOutput) score += 15;
  if (model.attachment) score += 10;
  score += Math.min((model.contextWindow ?? 0) / 4000, 40);
  return score;
}

const CURRENT_DATA_KEYWORDS = [
  'último',
  'ultimo',
  'actual',
  '2026',
  '2025',
  'noticias',
  'noticia',
  'hoy',
  'ayer',
  'esta semana',
  'este mes',
  'este año',
  'reciente',
  'novedades',
  'nuevo',
  'nueva',
  'clima',
  'tiempo',
  'cotización',
  'precio actual',
  'resultado',
  'elecciones',
  'mercado',
  'stock',
];

export function needsCurrentData(question: string): boolean {
  const normalized = question.toLowerCase();
  return CURRENT_DATA_KEYWORDS.some((kw) => normalized.includes(kw.toLowerCase()));
}

function stripMarkdownDecorators(value: string): string {
  return value
    .replace(/^[-*+]\s*/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\d+[.):-]?\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/[*_`]/g, '')
    .trim();
}

function extractMeaningfulLines(fullText: string): string[] {
  return fullText
    .split('\n')
    .map((line) => stripMarkdownDecorators(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^(enfoque general|soluci[oó]n detallada|por qu[eé]|tesis|plan|detalle|riesgos|mejora|raz[oó]n)$/i.test(
          line
        )
    );
}

export function assignCouncilAngles(models: Array<{ modelId: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < models.length; i++) {
    const angle = COUNCIL_ANGLES[i % COUNCIL_ANGLES.length];
    map.set(models[i].modelId, angle.id);
  }
  return map;
}

export function getCouncilAngleDescription(angleId: string): string {
  const angle = COUNCIL_ANGLES.find((a) => a.id === angleId);
  return angle ? `${angle.label}: ${angle.description}` : '';
}

export function selectCouncilModels(
  candidates: CouncilCandidateModel[],
  question?: string
): Array<CouncilCandidateModel & { tier: CouncilTier }> {
  const grouped = new Map<string, CouncilCandidateModel[]>();

  for (const candidate of candidates) {
    if (!isCouncilEligible(candidate.provider, candidate.modelId)) continue;
    const list = grouped.get(candidate.provider) ?? [];
    list.push(candidate);
    grouped.set(candidate.provider, list);
  }

  const boostToolCall = question ? needsCurrentData(question) : false;
  const selected: Array<CouncilCandidateModel & { tier: CouncilTier }> = [];

  for (const provider of Array.from(grouped.keys()).sort()) {
    const models = grouped.get(provider) ?? [];
    if (models.length === 0) continue;

    const best = [...models].sort(
      (a, b) =>
        scoreCandidate(b, { boostToolCall }) - scoreCandidate(a, { boostToolCall }) ||
        a.modelId.localeCompare(b.modelId)
    )[0];
    if (!best) continue;

    const tier = toCouncilTier(defaultTierFor(provider, best.modelId));
    selected.push({ ...best, tier });
  }

  // Diversity guard: if the question likely needs current data, make sure at
  // least one selected member can call tools, swapping in a toolCall-capable
  // model from the same provider when available.
  if (boostToolCall && !selected.some((m) => m.toolCall)) {
    for (let i = 0; i < selected.length; i++) {
      const provider = selected[i].provider;
      const alternatives = grouped.get(provider) ?? [];
      const toolAlternative = alternatives
        .filter((m) => m.toolCall)
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
      if (toolAlternative) {
        selected[i] = {
          ...toolAlternative,
          tier: toCouncilTier(defaultTierFor(provider, toolAlternative.modelId)),
        };
        break;
      }
    }
  }

  // Diversity guard: ensure at least one reasoning member when available.
  if (!selected.some((m) => m.reasoning)) {
    for (let i = 0; i < selected.length; i++) {
      const provider = selected[i].provider;
      const alternatives = grouped.get(provider) ?? [];
      const reasoningAlternative = alternatives
        .filter((m) => m.reasoning)
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
      if (reasoningAlternative) {
        selected[i] = {
          ...reasoningAlternative,
          tier: toCouncilTier(defaultTierFor(provider, reasoningAlternative.modelId)),
        };
        break;
      }
    }
  }

  return selected;
}

export function resolveVoteTarget(rawVote: string, availableModelIds: string[]): string | null {
  const normalized = rawVote
    .trim()
    .replace(/[[\]"'`]/g, '')
    .toLowerCase();
  const exact = availableModelIds.find((modelId) => modelId.toLowerCase() === normalized);
  if (exact) return exact;

  const contained = availableModelIds.find(
    (modelId) =>
      normalized.includes(modelId.toLowerCase()) || modelId.toLowerCase().includes(normalized)
  );
  return contained ?? null;
}

const MAX_HISTORY_CHARS = 12_000;

/**
 * Builds a readable transcript of the prior conversation (everything except the
 * current question) so the Council can deliberate WITH the chat context — e.g.
 * when the user starts in single mode and switches to Council mid-conversation
 * (mejora #6). Caps the transcript, keeping the most recent tail (latest turns
 * matter most), so a very long history can't blow up the token budget × N models.
 */
export function buildConversationContext(
  messages: Array<{ role: string; content: string }>,
  maxChars = MAX_HISTORY_CHARS
): string {
  const turns = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`);
  if (turns.length === 0) return '';

  const transcript = turns.join('\n\n');
  if (transcript.length <= maxChars) return transcript;
  return `[... inicio de la conversación omitido ...]\n\n${transcript.slice(transcript.length - maxChars)}`;
}

export function buildProposalPrompt(
  userQuestion: string,
  modelName: string,
  history = '',
  angle?: string
): string {
  const contextBlock = history
    ? `Para que tu propuesta sea coherente con la conversación previa, este es el historial hasta ahora:\n\n"""\n${history}\n"""\n\n`
    : '';
  const angleBlock = angle
    ? `\n\n## Tu perspectiva asignada\nActúa bajo el ángulo "${angle}". ${getCouncilAngleDescription(angle)}\n`
    : '';
  return `Eres ${modelName}. ${contextBlock}El usuario ha hecho la siguiente pregunta:

"""${userQuestion}"""

Tu tarea: PROPONER una solución completa, bien razonada y útil para que un CONSEJO de modelos la compare con otras alternativas. NO respondas con títulos vacíos, numeración suelta ni placeholders. Cada sección debe tener contenido real.${angleBlock}

Responde SOLO en markdown con este formato exacto:

# Tesis
Un párrafo de 2 a 4 oraciones con la idea central.

## Plan propuesto
- 3 a 6 pasos concretos

## Desarrollo
Explica la solución con detalle, usando ejemplos o código si aporta claridad.

## Riesgos y tradeoffs
- 2 a 4 bullets honestos

## Fuentes verificadas (si aplica)
- Si usaste web_search, lista cada fuente como: \`- [título](URL): snippet breve\`
- Si no usaste web_search, escribe "Sin fuentes externas".

## Cierre
Una conclusión breve explicando por qué este enfoque debería ser la base del consenso.`;
}

export function parseProposalSources(content: string): ParsedProposalSource[] {
  const sources: ParsedProposalSource[] = [];
  const sectionMatch = content.match(
    /##\s*Fuentes verificadas[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|##\s*Cierre|$)/i
  );
  const section = sectionMatch ? sectionMatch[1] : content;

  const regex = /-\s*\[([^\]]+)\]\s*\(([^)]+)\)\s*:?\s*(.*)/g;
  let match;
  while ((match = regex.exec(section)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    const snippet = match[3].trim();
    if (title && url && url.startsWith('http')) {
      sources.push({ title, url, snippet });
    }
  }
  return sources;
}

export function buildDebatePrompt(
  userQuestion: string,
  modelName: string,
  allProposals: Array<{ modelId: string; content: string }>,
  sharedSources?: ParsedProposalSource[]
): string {
  const proposalsText = allProposals
    .map((p) => `--- Propuesta de ${p.modelId} ---\n${p.content}`)
    .join('\n\n');

  const sourcesBlock = sharedSources?.length
    ? `\n\nFuentes compartidas del consejo (verificadas durante las propuestas):\n${sharedSources
        .map((s) => `- [${s.title}](${s.url}): ${s.snippet}`)
        .join('\n')}\n`
    : '';

  return `Eres ${modelName}. El usuario preguntó:

"""${userQuestion}"""

Has visto las propuestas de todos los modelos:

${proposalsText}${sourcesBlock}

Tu tarea: DEBATIR para ayudar al consejo a CONVERGER. No intentes “ganar”; intenta encontrar la mejor base común. Analiza fortalezas y debilidades de CADA propuesta (incluida la tuya), señala qué ideas deberían rescatarse, cuáles son las contradicciones factuales y cuál debería ser la base del consenso.

Responde SOLO en markdown con este formato:

# Evaluación comparativa
- Propuesta X: fortalezas / debilidades / nota 1-5 en claridad, corrección técnica, completitud
- Propuesta Y: fortalezas / debilidades / nota 1-5 en claridad, corrección técnica, completitud

# Mejor idea de cada propuesta ajena
- Propuesta X: la idea más valiosa que aporta
- Propuesta Y: la idea más valiosa que aporta

# Contradicciones factuales
- ... (o "Ninguna detectada")

# Base recomendada para el consenso
MODELO_BASE: [modelId exacto]

# Mejoras obligatorias para la base elegida
- 2 a 5 mejoras concretas que deberían incorporarse a la respuesta final`;
}

export function buildVotePrompt(
  userQuestion: string,
  modelName: string,
  allProposals: Array<{ modelId: string; content: string }>,
  debateSummary: string
): string {
  return `Eres ${modelName}. Pregunta del usuario:

"""${userQuestion}"""

Propuestas disponibles:
${allProposals.map((p) => `- ${p.modelId}: ${stripMarkdownDecorators(p.content).slice(0, 280)}...`).join('\n')}

Resumen del debate:
${debateSummary.slice(0, 500)}

Tu tarea: ELEGIR la mejor base para el consenso final del consejo. Piensa como grupo, no como competidor. Si tu opción inicial no fue la mejor, apoya la propuesta más sólida y contribuye una mejora.

Además de tu voto, indica:
- CONFIANZA: high (muy seguro), medium (razonablemente seguro) o low (dudoso).
- RIESGO: el principal riesgo o tradeoff de la propuesta elegida.

Responde ÚNICAMENTE con el formato exacto:

VOTO: [modelId]
RAZÓN: [una oración explicando por qué]
MEJORA: [una mejora concreta que la respuesta final debe incorporar]
CONFIANZA: [high|medium|low]
RIESGO: [principal riesgo]`;
}

export function buildSynthesisPrompt(
  userQuestion: string,
  winnerModelId: string,
  winnerProposal: string,
  allVotes: Array<{
    modelId: string;
    vote: string;
    reason: string;
    improvement: string;
    confidence?: string;
    risk?: string;
  }>,
  allProposals: Array<{ modelId: string; content: string }>,
  history = '',
  sharedSources?: ParsedProposalSource[]
): string {
  const contextBlock = history
    ? `\nContexto de la conversación previa con el usuario (mantén la respuesta coherente con esto):\n"""\n${history}\n"""\n`
    : '';
  const sourcesBlock = sharedSources?.length
    ? `\nFuentes verificadas compartidas por el consejo:\n${sharedSources
        .map((s) => `- [${s.title}](${s.url}): ${s.snippet}`)
        .join('\n')}\n`
    : '';
  return `Eres un sintetizador imparcial. El usuario preguntó:

"""${userQuestion}"""${contextBlock}
El consejo de modelos AI ya CONVERGIÓ en que la mejor base es la propuesta de ${winnerModelId}.${sourcesBlock}

Base ganadora:

${winnerProposal}

Otras propuestas del consejo (rescata lo mejor de ellas si aporta valor):

${allProposals.map((proposal) => `--- ${proposal.modelId} ---\n${proposal.content}`).join('\n\n')}

Observaciones del consejo para mejorar la base elegida:
${allVotes.map((v) => `- ${v.modelId}: votó por ${v.vote}. Razón: ${v.reason}. Mejora sugerida: ${v.improvement}${v.confidence ? ` (confianza: ${v.confidence})` : ''}${v.risk ? `. Riesgo: ${v.risk}` : ''}`).join('\n')}

Tu tarea: Redactar la respuesta FINAL consensuada para el usuario. Debes:
1. Integrar la base ganadora con las mejores mejoras aportadas por el resto del consejo.
2. Hacer que la respuesta final se sienta como una solución madura y colectiva.
3. Mantener una estructura visual excelente en markdown.
4. Si incluyes diagramas ASCII o bloques técnicos, SIEMPRE usa fenced code blocks.
5. Si incluyes tablas, usa markdown de tabla correcto.
6. NO digas que no hubo acuerdo. El consejo ya convergió.

Formato recomendado:
- Título corto
- Resumen ejecutivo
- Desarrollo por secciones
- Tabla comparativa si ayuda
- Pasos accionables / implementación
- Riesgos o tradeoffs si son importantes`;
}

export function buildSynthesisReviewPrompt(
  synthesisAnswer: string,
  improvements: string[]
): string {
  return `Revisa la siguiente respuesta final y confirma que incorpora todas las mejoras sugeridas por el consejo.

Mejoras sugeridas:
${improvements.map((i) => `- ${i}`).join('\n')}

Respuesta:
"""
${synthesisAnswer}
"""

Devuelve SOLO la respuesta final corregida, o la misma si ya está completa.`;
}

export function parseVote(content: string): ParsedVote | null {
  const voteMatch = content.match(/VOTO:\s*(\S+)/i);
  const reasonMatch = content.match(/RAZÓN:\s*(.+)/i);
  const improvementMatch = content.match(/MEJORA:\s*(.+)/i);
  const confidenceMatch = content.match(/CONFIANZA:\s*(high|medium|low)/i);
  const riskMatch = content.match(/RIESGO:\s*(.+)/i);
  if (!voteMatch) return null;
  return {
    vote: voteMatch[1].trim(),
    reason: reasonMatch ? reasonMatch[1].trim() : 'Sin razón proporcionada',
    improvement: improvementMatch ? improvementMatch[1].trim() : 'Sin mejora propuesta',
    confidence: confidenceMatch
      ? (confidenceMatch[1].toLowerCase() as 'high' | 'medium' | 'low')
      : undefined,
    risk: riskMatch ? riskMatch[1].trim() : undefined,
  };
}

export function aggregateConfidence(
  confidenceValues: Array<'high' | 'medium' | 'low' | undefined>
): 'high' | 'medium' | 'low' {
  const values = confidenceValues.filter((v): v is 'high' | 'medium' | 'low' => Boolean(v));
  if (values.length === 0) return 'medium';
  if (values.every((v) => v === 'high')) return 'high';
  if (values.some((v) => v === 'low')) return 'low';
  return 'medium';
}

export function summarizeApproach(fullText: string): string {
  const lines = extractMeaningfulLines(fullText);
  const candidate =
    lines.find((line) => /[a-záéíóúñ]/i.test(line) && line.length >= 12) ??
    lines[0] ??
    'Propuesta sin resumen';
  return candidate.length > 160 ? `${candidate.slice(0, 160).trim()}…` : candidate;
}

export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    openai: '#5cb08b',
    deepseek: '#5b91d6',
    google: '#9079ec',
    anthropic: '#cf9a5e',
    groq: '#f27a7a',
    mistral: '#7eb8da',
    openrouter: '#d077a0',
    togetherai: '#b8a0e0',
    fireworks: '#e8a87c',
    perplexity: '#9ecfa0',
    cohere: '#a0c4e8',
    xai: '#e8a0a0',
    minimax: '#a0e8c4',
    azure: '#7ab8d0',
  };
  return colors[provider] || '#d077a0';
}

export interface CouncilValidationResult {
  valid: boolean;
  validModels: string[];
  error?: string;
}

/**
 * Validates a user-selected council configuration against the current
 * connected providers and model registry. Silently drops invalid entries
 * (malformed IDs, disconnected providers, or models not in registry).
 */
export function validateCouncilConfig(
  modelIds: string[],
  connectedProviders: Set<string>,
  textModels: Array<{ provider: string; modelId: string }>
): CouncilValidationResult {
  if (modelIds.length < 2) {
    return { valid: false, validModels: [], error: 'Se necesitan al menos 2 modelos' };
  }
  if (modelIds.length > 8) {
    return { valid: false, validModels: [], error: 'Máximo 8 modelos permitidos' };
  }

  const registrySet = new Set(textModels.map((m) => `${m.provider}:${m.modelId}`));
  const validModels: string[] = [];
  const validProviders = new Set<string>();

  for (const rawId of modelIds) {
    const parts = rawId.split(':');
    if (parts.length !== 2) continue;
    const [provider, modelId] = parts;
    if (!provider || !modelId) continue;
    if (!connectedProviders.has(provider)) continue;
    if (!registrySet.has(rawId)) continue;
    validModels.push(rawId);
    validProviders.add(provider);
  }

  if (validModels.length < 2) {
    return {
      valid: false,
      validModels,
      error: 'Después de filtrar, quedan menos de 2 modelos válidos',
    };
  }
  if (validProviders.size < 2) {
    return { valid: false, validModels, error: 'Se necesitan al menos 2 proveedores diferentes' };
  }

  return { valid: true, validModels };
}

/**
 * Builds council member objects from validated model IDs.
 * All manually-selected models are treated as "strong" tier
 * since the user explicitly wants them in the council.
 */
export function buildCouncilMembersFromConfig(
  validModelIds: string[],
  textModels: Array<{
    provider: string;
    modelId: string;
    contextWindow?: number;
    reasoning?: boolean;
    toolCall?: boolean;
    structuredOutput?: boolean;
  }>
): Array<CouncilCandidateModel & { tier: CouncilTier }> {
  const modelMap = new Map(textModels.map((m) => [`${m.provider}:${m.modelId}`, m]));

  return validModelIds.map((rawId) => {
    const model = modelMap.get(rawId)!;
    return {
      modelId: model.modelId,
      provider: model.provider,
      displayName: model.modelId,
      contextWindow: model.contextWindow,
      reasoning: model.reasoning,
      toolCall: model.toolCall,
      structuredOutput: model.structuredOutput,
      attachment: false,
      tier: 'strong' as CouncilTier,
    };
  });
}
