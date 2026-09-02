<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Document;
use App\Models\User;
use DOMDocument;
use DOMElement;
use DOMXPath;
use RuntimeException;
use ZipArchive;

final class WordDocumentBranding
{
    private const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    private const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    private const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
    private const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

    public function apply(string $path, Document $document, User $user): void
    {
        if ($document->extension !== 'docx') {
            return;
        }

        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RuntimeException('O arquivo DOCX enviado não é válido.');
        }

        try {
            $this->updateContentTypes($zip);
            $this->updateDocumentRelationships($zip);
            $this->updateSections($zip);
            $this->writeHeader($zip, $document);
            $this->writeFooter($zip, $document, $user);
        } finally {
            $zip->close();
        }
    }

    private function updateContentTypes(ZipArchive $zip): void
    {
        $xml = $this->requiredEntry($zip, '[Content_Types].xml');
        $dom = $this->xml($xml);
        $root = $dom->documentElement;
        if (! $root) {
            throw new RuntimeException('O arquivo DOCX não possui tipos de conteúdo válidos.');
        }

        $this->appendUniquePart($dom, $root, 'Override', 'PartName', '/word/headerInfinity.xml', [
            'ContentType' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
        ]);
        $this->appendUniquePart($dom, $root, 'Override', 'PartName', '/word/footerInfinity.xml', [
            'ContentType' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
        ]);
        $this->appendUniquePart($dom, $root, 'Default', 'Extension', 'svg', [
            'ContentType' => 'image/svg+xml',
        ]);

        $zip->addFromString('[Content_Types].xml', (string) $dom->saveXML());
    }

    private function updateDocumentRelationships(ZipArchive $zip): void
    {
        $name = 'word/_rels/document.xml.rels';
        $dom = $this->xml($this->requiredEntry($zip, $name));
        $root = $dom->documentElement;
        if (! $root) {
            throw new RuntimeException('O arquivo DOCX não possui relacionamentos válidos.');
        }

        $this->replaceRelationship($dom, $root, 'rIdInfinityHeader',
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', 'headerInfinity.xml');
        $this->replaceRelationship($dom, $root, 'rIdInfinityFooter',
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer', 'footerInfinity.xml');

        $zip->addFromString($name, (string) $dom->saveXML());
    }

    private function updateSections(ZipArchive $zip): void
    {
        $name = 'word/document.xml';
        $dom = $this->xml($this->requiredEntry($zip, $name));
        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('w', self::WORD_NS);
        $sections = $xpath->query('//w:sectPr');
        if (! $sections || $sections->length === 0) {
            throw new RuntimeException('O arquivo DOCX não possui uma seção editável.');
        }

        foreach ($sections as $section) {
            if (! $section instanceof DOMElement) {
                continue;
            }
            foreach (['headerReference', 'footerReference'] as $referenceName) {
                $references = $xpath->query('./w:'.$referenceName, $section);
                if (! $references) {
                    continue;
                }
                foreach (iterator_to_array($references) as $reference) {
                    $section->removeChild($reference);
                }
            }

            $header = $dom->createElementNS(self::WORD_NS, 'w:headerReference');
            $header->setAttributeNS(self::WORD_NS, 'w:type', 'default');
            $header->setAttributeNS(self::REL_NS, 'r:id', 'rIdInfinityHeader');
            $footer = $dom->createElementNS(self::WORD_NS, 'w:footerReference');
            $footer->setAttributeNS(self::WORD_NS, 'w:type', 'default');
            $footer->setAttributeNS(self::REL_NS, 'r:id', 'rIdInfinityFooter');

            $section->insertBefore($footer, $section->firstChild);
            $section->insertBefore($header, $section->firstChild);
        }

        $zip->addFromString($name, (string) $dom->saveXML());
    }

    private function writeHeader(ZipArchive $zip, Document $document): void
    {
        $logoPath = base_path('frontend/public/images/logo.svg');
        $logo = is_file($logoPath) ? file_get_contents($logoPath) : false;
        if (! is_string($logo) || $logo === '') {
            throw new RuntimeException('A marca do Infinity não foi encontrada para montar o cabeçalho.');
        }

        $zip->addFromString('word/media/infinity-logo.svg', $logo);
        $zip->addFromString('word/_rels/headerInfinity.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="'.self::PACKAGE_REL_NS.'">'
            .'<Relationship Id="rIdInfinityLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/infinity-logo.svg"/>'
            .'</Relationships>');

        $title = $this->escape($document->title);
        $sector = $this->escape($document->sector);
        $type = $this->escape($this->categoryLabel($document->category));
        $zip->addFromString('word/headerInfinity.xml', <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:tbl>
    <w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="16" w:color="DB0F0F"/></w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="6100"/><w:gridCol w:w="2900"/></w:tblGrid>
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="6100" w:type="dxa"/></w:tcPr>
        <w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1417320" cy="543912"/><wp:docPr id="9001" name="Metalique Infinity"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Metalique Infinity"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdInfinityLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1417320" cy="543912"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        <w:p><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>{$title}</w:t></w:r></w:p>
      </w:tc>
      <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
        <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="898781"/><w:sz w:val="16"/></w:rPr><w:t>DOCUMENTAÇÃO</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="DB0F0F"/><w:sz w:val="22"/></w:rPr><w:t>{$type}</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="52514E"/><w:sz w:val="16"/></w:rPr><w:t>{$sector}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
</w:hdr>
XML);
    }

    private function writeFooter(ZipArchive $zip, Document $document, User $user): void
    {
        $creator = $this->escape($user->name);
        $jobTitle = $this->escape((string) $user->job_title);
        $zip->addFromString('word/footerInfinity.xml', <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="E1E0D9"/></w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
    <w:tr>
      <w:tc><w:p><w:pPr><w:spacing w:before="180"/></w:pPr><w:r><w:rPr><w:color w:val="52514E"/><w:sz w:val="18"/></w:rPr><w:t>Elaborado por: {$creator}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:pPr><w:spacing w:before="180"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="52514E"/><w:sz w:val="18"/></w:rPr><w:t>Aprovado por: ____________________</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:color w:val="898781"/><w:sz w:val="16"/></w:rPr><w:t>Registrado por {$creator} · {$jobTitle}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:color w:val="DB0F0F"/><w:sz w:val="16"/></w:rPr><w:t>Página </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="DB0F0F"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p>
</w:ftr>
XML);
    }

    private function appendUniquePart(DOMDocument $dom, DOMElement $root, string $elementName, string $key, string $value, array $attributes): void
    {
        foreach ($root->childNodes as $child) {
            if ($child instanceof DOMElement && $child->localName === $elementName && $child->getAttribute($key) === $value) {
                return;
            }
        }
        $element = $dom->createElementNS(self::CONTENT_TYPES_NS, $elementName);
        $element->setAttribute($key, $value);
        foreach ($attributes as $name => $attributeValue) {
            $element->setAttribute($name, $attributeValue);
        }
        $root->appendChild($element);
    }

    private function replaceRelationship(DOMDocument $dom, DOMElement $root, string $id, string $type, string $target): void
    {
        foreach (iterator_to_array($root->childNodes) as $child) {
            if ($child instanceof DOMElement && $child->getAttribute('Id') === $id) {
                $root->removeChild($child);
            }
        }
        $relationship = $dom->createElementNS(self::PACKAGE_REL_NS, 'Relationship');
        $relationship->setAttribute('Id', $id);
        $relationship->setAttribute('Type', $type);
        $relationship->setAttribute('Target', $target);
        $root->appendChild($relationship);
    }

    private function requiredEntry(ZipArchive $zip, string $name): string
    {
        $contents = $zip->getFromName($name);
        if (! is_string($contents) || $contents === '') {
            throw new RuntimeException('O arquivo DOCX está incompleto: '.$name.'.');
        }

        return $contents;
    }

    private function xml(string $contents): DOMDocument
    {
        $dom = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $loaded = $dom->loadXML($contents, LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (! $loaded) {
            throw new RuntimeException('O arquivo DOCX contém XML inválido.');
        }

        return $dom;
    }

    private function categoryLabel(string $category): string
    {
        return [
            'word' => 'Word',
            'pdf' => 'PDF',
            'foto' => 'Foto',
            'procedimento' => 'Procedimento',
            'mapa' => 'Mapa',
            'diagrama' => 'Diagrama',
            'fluxograma' => 'Fluxograma',
            'organograma' => 'Organograma',
            'outro' => 'Outro',
        ][$category] ?? 'Outro';
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
