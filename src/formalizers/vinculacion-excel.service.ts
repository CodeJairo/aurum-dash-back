import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { CompleteVinculacionDto } from './dto/complete-vinculacion.dto';

@Injectable()
export class VinculacionExcelService {
  private readonly logger = new Logger(VinculacionExcelService.name);

  private getTemplatePath(): string {
    const candidates = [
      path.resolve(process.cwd(), 'uploads/documents/Formulario Unico de Vinculacion Proveedores de metales preciosos.xlsx'),
      path.resolve(process.cwd(), 'back/uploads/documents/Formulario Unico de Vinculacion Proveedores de metales preciosos.xlsx'),
      path.resolve(__dirname, '../../../uploads/documents/Formulario Unico de Vinculacion Proveedores de metales preciosos.xlsx'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    throw new NotFoundException(
      'No se encontró la plantilla oficial de Formulario Único de Vinculación en uploads/documents.',
    );
  }

  async generateVinculacionWorkbook(dto: CompleteVinculacionDto, cityDefault: string = 'Quibdó'): Promise<Buffer> {
    const templatePath = this.getTemplatePath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const ws = workbook.worksheets[0];
    if (!ws) {
      throw new Error('La plantilla de vinculación no contiene hojas de cálculo válidas.');
    }

    const today = new Date();
    const fillDateObj = dto.fillDate ? new Date(dto.fillDate) : today;
    const dateStr = dto.fillDate ? dto.fillDate.slice(0, 10) : today.toISOString().slice(0, 10);
    const day = isNaN(fillDateObj.getDate()) ? today.getDate() : fillDateObj.getDate();
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const monthIdx = isNaN(fillDateObj.getMonth()) ? today.getMonth() : fillDateObj.getMonth();
    const monthName = monthNames[monthIdx];
    const year = isNaN(fillDateObj.getFullYear()) ? today.getFullYear() : fillDateObj.getFullYear();
    const effectiveCity = dto.fillCity?.trim() || dto.city?.trim() || cityDefault;

    // 1. Proceso, Ciudad y Fecha
    ws.getCell('C10').value = 'X'; // Vinculación
    ws.getCell('F10').value = effectiveCity;
    ws.getCell('L10').value = dateStr;

    // 2. Datos Generales
    ws.getCell('A15').value = `Nombres: ${dto.firstName.trim().toUpperCase()}`;
    ws.getCell('A16').value = `Primer apellido: ${dto.firstLastName.trim().toUpperCase()}`;
    ws.getCell('H16').value = `Segundo apellido: ${(dto.secondLastName || '').trim().toUpperCase()}`;

    const idType = dto.idType || 'CC';
    ws.getCell('A17').value = `Tipo de identificación: ${idType}`;
    ws.getCell('G17').value = `No. ${dto.document.trim()}`;
    ws.getCell('K17').value = `Nacionalidad: ${dto.nationality || 'Colombiana'}`;

    const issueDate = dto.docIssueDate ? dto.docIssueDate.slice(0, 10) : '';
    ws.getCell('A18').value = `Fecha de expedición: ${issueDate}`;
    ws.getCell('G18').value = `Lugar: ${dto.docIssuePlace || effectiveCity}`;
    ws.getCell('K18').value = `Pais: ${dto.country || 'Colombia'}`;

    ws.getCell('A19').value = `Dirección de residencia:  ${dto.address.trim()}`;
    ws.getCell('H19').value = `Teléfono fijo y/o celular: ${dto.phone || 'N/A'}`;

    const miningMun = dto.miningMunicipality || effectiveCity;
    const miningDept = dto.miningDepartment || 'Chocó';
    ws.getCell('A20').value = `Municipio donde ejerce la mineria: ${miningMun}`;
    ws.getCell('J20').value = `Departamento: ${miningDept}`;

    ws.getCell('A21').value = `Correo electrónico: ${dto.email.trim()}`;

    // Actividad Económica & Tributaria
    const ciiu = dto.ciiuCode?.trim() || '0729';
    const ciiuDesc = dto.ciiuDescription?.trim() || 'Extracción de otros minerales metalíferos no ferrosos n.c.p.';
    ws.getCell('A23').value = `Actividad económica (Código CIIU y descripción): ${ciiu} - ${ciiuDesc}`;

    if (dto.declaresRent) {
      ws.getCell('G24').value = 'X';
      ws.getCell('L24').value = '';
    } else {
      ws.getCell('G24').value = '';
      ws.getCell('L24').value = 'X';
    }

    // 2. Información Financiera
    const incomeFormatted = (Number(dto.monthlyIncome) || 0).toLocaleString('es-CO');
    const expensesFormatted = (Number(dto.monthlyExpenses) || 0).toLocaleString('es-CO');
    ws.getCell('A27').value = `Ingresos mensuales: $ ${incomeFormatted}`;
    ws.getCell('H27').value = `Egresos mensuales: $ ${expensesFormatted}`;
    ws.getCell('A28').value = `Concepto: ${dto.incomeConcept || 'Minería de subsistencia'}`;
    ws.getCell('H28').value = `Concepto: ${dto.expenseConcept || 'Gastos personales y familiares'}`;

    // 3. PEP
    const pepMark = dto.isPep ? '[ X ] SI   [   ] NO' : '[   ] SI   [ X ] NO';
    ws.getCell('A33').value = `¿Es Persona Públicamente Expuesta? Marcar la opción SI o en caso de gozar de reconocimiento público: ${pepMark}`;
    ws.getCell('H33').value = `¿Es Persona Políticamente Expuesta? Marcar la opción SI en caso de cumplir con los lineamientos...: ${pepMark}`;

    ws.getCell('A36').value = `Si marco afirmativamente en alguno de los dos campos anteriores, indique el cargo o la función desempañada: ${dto.isPep && dto.pepPosition ? dto.pepPosition : 'N/A'}`;
    ws.getCell('A37').value = `Fecha de vinculación al cargo: ${dto.isPep && dto.pepStartDate ? dto.pepStartDate : 'N/A'}`;
    ws.getCell('H37').value = `Fecha de desvinculación al cargo: ${dto.isPep && dto.pepEndDate ? dto.pepEndDate : 'N/A'}`;

    const orgMark = dto.isOrgRep ? '[ X ] SI   [   ] NO' : '[   ] SI   [ X ] NO';
    ws.getCell('A38').value = `¿Es representante legal de alguna organización internacional? ${orgMark}`;
    ws.getCell('A39').value = `Si la respuesta es Si, indique el nombre de la organización: ${dto.isOrgRep && dto.orgName ? dto.orgName : 'N/A'}`;

    const spouseMark = dto.hasPepSpouse ? '[ X ] SI   [   ] NO' : '[   ] SI   [ X ] NO';
    ws.getCell('A40').value = `¿Tiene usted una sociedad conyugal, de hecho, o de derecho, con personas públicamente expuestas...? ${spouseMark}`;
    ws.getCell('A41').value = `Nombre del conyugue: ${dto.hasPepSpouse && dto.pepSpouseName ? dto.pepSpouseName : 'N/A'}`;
    ws.getCell('F41').value = `Parentesco: ${dto.hasPepSpouse && dto.pepSpouseRelationship ? dto.pepSpouseRelationship : 'N/A'}`;
    ws.getCell('J41').value = `Cargo: ${dto.hasPepSpouse && dto.pepSpousePosition ? dto.pepSpousePosition : 'N/A'}`;

    // 4. Origen de Fondos
    const originalA44 = ws.getCell('A44').value;
    const originDesc = dto.fundsOriginActivities?.trim() || 'Extracción y comercialización de oro y metales preciosos como minero de subsistencia';
    if (typeof originalA44 === 'string') {
      ws.getCell('A44').value = originalA44.replace(
        '______________________________________________________________________________________________________________________',
        originDesc,
      );
    }

    // 5. Referencias
    // 5.1 Bancaria
    const bankMark = dto.hasBankAccount ? '[ X ] SI   [   ] NO' : '[   ] SI   [ X ] NO';
    ws.getCell('A47').value = `Posee cuenta bancaria: ${bankMark}`;
    ws.getCell('A48').value = `Entidad: ${dto.hasBankAccount && dto.bankName ? dto.bankName : 'N/A'}`;
    ws.getCell('F48').value = `Sucursal: ${dto.hasBankAccount && dto.bankBranch ? dto.bankBranch : 'N/A'}`;
    ws.getCell('K48').value = `Ciudad: ${dto.hasBankAccount && dto.bankCity ? dto.bankCity : 'N/A'}`;

    ws.getCell('A49').value = `Nro. de cuenta: ${dto.hasBankAccount && dto.bankAccountNumber ? dto.bankAccountNumber : 'N/A'}`;
    ws.getCell('F49').value = `Tipo de cuenta: ${dto.hasBankAccount && dto.bankAccountType ? dto.bankAccountType : 'N/A'}`;
    ws.getCell('K49').value = `Tiempo de vinculación: ${dto.hasBankAccount && dto.bankAccountYears ? dto.bankAccountYears : 'N/A'}`;

    // 5.2 Personal
    ws.getCell('A52').value = `Nombre y apellidos: ${dto.refPersonalName || 'N/A'}`;
    ws.getCell('A53').value = `Relación/parentesco: ${dto.refPersonalRelationship || 'N/A'}`;
    ws.getCell('F53').value = `Dirección: ${dto.refPersonalAddress || 'N/A'}`;
    ws.getCell('K53').value = `Télefono fijo y/o celular: ${dto.refPersonalPhone || 'N/A'}`;

    // 6. Declaración final y Firmas
    const fullName = `${dto.firstName} ${dto.firstLastName} ${dto.secondLastName || ''}`.trim().toUpperCase();
    ws.getCell('A66').value =
      `Certifico que la información suministrada en el presente documento es veraz, que en caso de requerir su actualización me comprometo a reportarla oportunamente, y que habiendo leído, comprendido y aceptado lo anterior, lo firmo a los ${day} días del mes de ${monthName} del año ${year}, en la ciudad de ${effectiveCity}.`;

    ws.getCell('A68').value = `Nombre y apellidos: ${fullName}`;
    ws.getCell('A72').value = `Cedula: ${dto.document.trim()}`;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
